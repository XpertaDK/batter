package device

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

// SessionTier represents the quality tier for a scrcpy session.
type SessionTier string

const (
	TierThumbnail SessionTier = "thumbnail" // 360p, 5fps — grid view
	TierFull      SessionTier = "full"      // 1024p, 30fps — focused view
)

// TierOptions returns SessionOptions for the given tier.
func TierOptions(tier SessionTier) SessionOptions {
	switch tier {
	case TierThumbnail:
		return SessionOptions{MaxSize: 360, MaxFPS: 5}
	case TierFull:
		return SessionOptions{MaxSize: 1024, MaxFPS: 30}
	default:
		return SessionOptions{MaxSize: 1024, MaxFPS: 30}
	}
}

// ManagerConfig holds configuration for the device manager.
type ManagerConfig struct {
	ScrcpyServerPath string
	ScrcpyVersion    string
	Logger           *slog.Logger
}

// Manager manages ADB devices and scrcpy sessions.
type Manager struct {
	adb              *ADB
	sessions         map[string]*Session
	sessionTiers     map[string]SessionTier
	fullViewers      map[string]int // reference count of full-quality viewers per serial
	mu               sync.RWMutex
	scrcpyServerPath string
	scrcpyVersion    string
	logger           *slog.Logger
}

// NewManager creates a new device manager.
func NewManager(cfg ManagerConfig) (*Manager, error) {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	logger := cfg.Logger.With("component", "device-manager")

	adb, err := NewADB(cfg.Logger)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize ADB: %w", err)
	}

	// Validate scrcpy-server binary exists
	if cfg.ScrcpyServerPath == "" {
		return nil, fmt.Errorf("scrcpy-server path is required")
	}
	if _, err := os.Stat(cfg.ScrcpyServerPath); err != nil {
		return nil, fmt.Errorf("scrcpy-server not found at %s: %w", cfg.ScrcpyServerPath, err)
	}

	logger.Info("device manager initialized",
		"scrcpy_server", cfg.ScrcpyServerPath,
		"adb_path", adb.adbPath,
	)

	scrcpyVersion := cfg.ScrcpyVersion
	if scrcpyVersion == "" {
		scrcpyVersion = "2.7"
	}

	return &Manager{
		adb:              adb,
		sessions:         make(map[string]*Session),
		sessionTiers:     make(map[string]SessionTier),
		fullViewers:      make(map[string]int),
		scrcpyServerPath: cfg.ScrcpyServerPath,
		scrcpyVersion:    scrcpyVersion,
		logger:           logger,
	}, nil
}

// ListDevices returns all connected ADB devices with session status.
func (m *Manager) ListDevices(ctx context.Context) ([]DeviceInfo, error) {
	devices, err := m.adb.ListDevices(ctx)
	if err != nil {
		return nil, err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []DeviceInfo
	for _, d := range devices {
		info := DeviceInfo{
			Serial:  d.Serial,
			State:   d.State,
			Model:   d.Model,
			Product: d.Product,
		}
		if s, ok := m.sessions[d.Serial]; ok {
			info.HasSession = true
			info.Width = s.Width
			info.Height = s.Height
		}
		if tier, ok := m.sessionTiers[d.Serial]; ok {
			info.SessionTier = tier
		}
		result = append(result, info)
	}
	return result, nil
}

// StartSession starts a scrcpy session for a device. If a dead session exists, it is replaced.
func (m *Manager) StartSession(ctx context.Context, serial string, opts SessionOptions) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If session exists and is alive, return it
	if s, ok := m.sessions[serial]; ok {
		if s.IsAlive() {
			return s, nil
		}
		// Dead session — clean up before starting a new one
		m.logger.Info("replacing dead session", "serial", serial)
		s.Close()
		delete(m.sessions, serial)

		// Kill any lingering scrcpy-server process on the device and wait for cleanup
		_, _ = m.adb.Shell(ctx, serial, "pkill", "-9", "-f", "app_process.*scrcpy")
		// Remove all reverse tunnels to free abstract sockets
		_, _ = m.adb.run(ctx, "-s", serial, "reverse", "--remove-all")
		// Brief delay for the device to fully release the process
		time.Sleep(500 * time.Millisecond)
	}

	session, err := newSession(m.adb, serial, m.scrcpyServerPath, m.scrcpyVersion, opts, m.logger)
	if err != nil {
		return nil, fmt.Errorf("failed to start session for %s: %w", serial, err)
	}

	m.sessions[serial] = session

	// Determine tier from options
	tier := TierFull
	if opts.MaxSize > 0 && opts.MaxSize <= 360 {
		tier = TierThumbnail
	}
	m.sessionTiers[serial] = tier

	m.logger.Info("session started", "serial", serial, "width", session.Width, "height", session.Height, "tier", tier)
	return session, nil
}

// StopSession stops a running scrcpy session.
func (m *Manager) StopSession(serial string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	s, ok := m.sessions[serial]
	if !ok {
		return fmt.Errorf("no session for device %s", serial)
	}

	s.Close()
	delete(m.sessions, serial)
	delete(m.sessionTiers, serial)
	delete(m.fullViewers, serial)

	// Force-kill any lingering scrcpy process and clean up reverse tunnels
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, _ = m.adb.Shell(ctx, serial, "pkill", "-9", "-f", "app_process.*scrcpy")
	_, _ = m.adb.run(ctx, "-s", serial, "reverse", "--remove-all")

	m.logger.Info("session stopped", "serial", serial)
	return nil
}

// RestartSession stops any existing session and starts a fresh one.
func (m *Manager) RestartSession(ctx context.Context, serial string, opts SessionOptions) (*Session, error) {
	m.mu.Lock()

	if s, ok := m.sessions[serial]; ok {
		s.Close()
		delete(m.sessions, serial)
		delete(m.sessionTiers, serial)
	}

	// Kill any lingering scrcpy-server and clean up reverse tunnels
	_, _ = m.adb.Shell(ctx, serial, "pkill", "-9", "-f", "app_process.*scrcpy")
	_, _ = m.adb.run(ctx, "-s", serial, "reverse", "--remove-all")
	time.Sleep(500 * time.Millisecond)
	m.mu.Unlock()

	return m.StartSession(ctx, serial, opts)
}

// UpgradeSession switches a device session from thumbnail to full quality.
// Returns the new session. Increments the full-viewer reference count.
func (m *Manager) UpgradeSession(ctx context.Context, serial string) (*Session, error) {
	m.mu.Lock()
	currentTier := m.sessionTiers[serial]
	m.fullViewers[serial]++
	count := m.fullViewers[serial]
	m.mu.Unlock()

	m.logger.Info("upgrade requested", "serial", serial, "current_tier", currentTier, "full_viewers", count)

	if currentTier == TierFull {
		// Already full quality, just return existing session
		s := m.GetSession(serial)
		if s != nil {
			return s, nil
		}
	}

	return m.RestartSession(ctx, serial, TierOptions(TierFull))
}

// DowngradeSession decrements the full-viewer reference count.
// When count reaches 0, switches back to thumbnail quality.
func (m *Manager) DowngradeSession(ctx context.Context, serial string) (*Session, error) {
	m.mu.Lock()
	m.fullViewers[serial]--
	if m.fullViewers[serial] < 0 {
		m.fullViewers[serial] = 0
	}
	count := m.fullViewers[serial]
	m.mu.Unlock()

	m.logger.Info("downgrade requested", "serial", serial, "full_viewers", count)

	if count > 0 {
		// Other viewers still need full quality
		s := m.GetSession(serial)
		if s != nil {
			return s, nil
		}
	}

	return m.RestartSession(ctx, serial, TierOptions(TierThumbnail))
}

// GetSessionTier returns the current tier for a device session.
func (m *Manager) GetSessionTier(serial string) SessionTier {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessionTiers[serial]
}

// GetSession returns an active session for a device.
func (m *Manager) GetSession(serial string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[serial]
}

// WakeScreen wakes the device screen via ADB shell key events.
func (m *Manager) WakeScreen(ctx context.Context, serial string) error {
	if _, err := m.adb.Shell(ctx, serial, "input", "keyevent", "KEYCODE_WAKEUP"); err != nil {
		return fmt.Errorf("send WAKEUP: %w", err)
	}
	return nil
}

// SetKeepAwake enables or disables stay-awake mode on the device.
func (m *Manager) SetKeepAwake(ctx context.Context, serial string, enabled bool) error {
	if enabled {
		_, _ = m.adb.Shell(ctx, serial, "settings", "put", "system", "screen_off_timeout", "2147483647")
		_, _ = m.adb.Shell(ctx, serial, "settings", "put", "global", "stay_on_while_plugged_in", "3")
	} else {
		_, _ = m.adb.Shell(ctx, serial, "settings", "put", "system", "screen_off_timeout", "30000")
		_, _ = m.adb.Shell(ctx, serial, "settings", "put", "global", "stay_on_while_plugged_in", "0")
	}
	return nil
}

// HealthStatus reports the readiness of the device subsystem.
type HealthStatus struct {
	ADBAvailable  bool   `json:"adb_available"`
	ADBVersion    string `json:"adb_version,omitempty"`
	ScrcpyServer  bool   `json:"scrcpy_server"`
	ScrcpyVersion string `json:"scrcpy_version,omitempty"`
	DeviceCount   int    `json:"device_count"`
}

// Health checks whether ADB, scrcpy-server, and connected devices are available.
func (m *Manager) Health(ctx context.Context) HealthStatus {
	status := HealthStatus{
		ScrcpyServer:  m.scrcpyServerPath != "",
		ScrcpyVersion: m.scrcpyVersion,
	}

	// Check ADB
	out, err := m.adb.run(ctx, "version")
	if err == nil {
		status.ADBAvailable = true
		if lines := strings.SplitN(string(out), "\n", 2); len(lines) > 0 {
			status.ADBVersion = strings.TrimSpace(lines[0])
		}
	}

	// Count connected devices
	devices, err := m.adb.ListDevices(ctx)
	if err == nil {
		status.DeviceCount = len(devices)
	}

	return status
}

// Screenshot captures the device screen.
func (m *Manager) Screenshot(ctx context.Context, serial string) ([]byte, error) {
	return m.adb.Screenshot(ctx, serial)
}

// Shutdown stops all sessions.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for serial, s := range m.sessions {
		s.Close()
		m.logger.Info("session closed during shutdown", "serial", serial)
	}
	m.sessions = make(map[string]*Session)
	m.sessionTiers = make(map[string]SessionTier)
	m.fullViewers = make(map[string]int)
}

// DeviceInfo extends ADBDevice with session status.
type DeviceInfo struct {
	Serial      string      `json:"serial"`
	State       string      `json:"state"`
	Model       string      `json:"model"`
	Product     string      `json:"product"`
	HasSession  bool        `json:"has_session"`
	Width       int         `json:"width,omitempty"`
	Height      int         `json:"height,omitempty"`
	SessionTier SessionTier `json:"session_tier,omitempty"`
}
