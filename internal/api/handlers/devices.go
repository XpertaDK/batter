package handlers

import (
	"log/slog"
	"net/http"

	"github.com/XpertaDK/batter/internal/device"
	"github.com/gin-gonic/gin"
)

// DeviceHandler handles device-related API requests.
type DeviceHandler struct {
	deviceManager *device.Manager
	logger        *slog.Logger
}

// NewDeviceHandler creates a new device handler.
func NewDeviceHandler(dm *device.Manager, logger *slog.Logger) *DeviceHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &DeviceHandler{
		deviceManager: dm,
		logger:        logger.With("handler", "devices"),
	}
}

// DeviceHealth returns the status of device prerequisites (ADB, scrcpy, connected devices).
func (h *DeviceHandler) DeviceHealth(c *gin.Context) {
	status := h.deviceManager.Health(c.Request.Context())
	c.JSON(http.StatusOK, status)
}

// ListDevices returns all connected devices with session status.
func (h *DeviceHandler) ListDevices(c *gin.Context) {
	devices, err := h.deviceManager.ListDevices(c.Request.Context())
	if err != nil {
		h.logger.Error("failed to list devices", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list devices"})
		return
	}
	if devices == nil {
		devices = []device.DeviceInfo{}
	}
	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

// GetDevice returns info for a single device.
func (h *DeviceHandler) GetDevice(c *gin.Context) {
	serial := c.Param("serial")

	devices, err := h.deviceManager.ListDevices(c.Request.Context())
	if err != nil {
		h.logger.Error("failed to list devices", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list devices"})
		return
	}

	for _, d := range devices {
		if d.Serial == serial {
			c.JSON(http.StatusOK, d)
			return
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
}

// StartSessionRequest represents a request to start a scrcpy session.
type StartSessionRequest struct {
	MaxSize int `json:"max_size"`
	MaxFPS  int `json:"max_fps"`
}

// StartSession starts a scrcpy session for a device.
func (h *DeviceHandler) StartSession(c *gin.Context) {
	serial := c.Param("serial")

	var req StartSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req = StartSessionRequest{}
	}

	session, err := h.deviceManager.StartSession(c.Request.Context(), serial, device.SessionOptions{
		MaxSize: req.MaxSize,
		MaxFPS:  req.MaxFPS,
	})
	if err != nil {
		h.logger.Error("failed to start session", "serial", serial, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"serial":       session.Serial,
		"device_name":  session.DeviceName,
		"width":        session.Width,
		"height":       session.Height,
		"session_tier": h.deviceManager.GetSessionTier(serial),
	})
}

// StopSession stops a running scrcpy session.
func (h *DeviceHandler) StopSession(c *gin.Context) {
	serial := c.Param("serial")

	if err := h.deviceManager.StopSession(serial); err != nil {
		h.logger.Error("failed to stop session", "serial", serial, "error", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "session stopped"})
}

// UpgradeSession switches a device session to full quality.
func (h *DeviceHandler) UpgradeSession(c *gin.Context) {
	serial := c.Param("serial")

	session, err := h.deviceManager.UpgradeSession(c.Request.Context(), serial)
	if err != nil {
		h.logger.Error("failed to upgrade session", "serial", serial, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"serial":       session.Serial,
		"width":        session.Width,
		"height":       session.Height,
		"session_tier": h.deviceManager.GetSessionTier(serial),
	})
}

// DowngradeSession switches a device session back to thumbnail quality.
func (h *DeviceHandler) DowngradeSession(c *gin.Context) {
	serial := c.Param("serial")

	session, err := h.deviceManager.DowngradeSession(c.Request.Context(), serial)
	if err != nil {
		h.logger.Error("failed to downgrade session", "serial", serial, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"serial":       session.Serial,
		"width":        session.Width,
		"height":       session.Height,
		"session_tier": h.deviceManager.GetSessionTier(serial),
	})
}

// WakeScreen wakes the device screen via ADB.
func (h *DeviceHandler) WakeScreen(c *gin.Context) {
	serial := c.Param("serial")

	if err := h.deviceManager.WakeScreen(c.Request.Context(), serial); err != nil {
		h.logger.Error("failed to wake screen", "serial", serial, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to wake screen"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "screen woken"})
}

// Screenshot captures the device screen.
func (h *DeviceHandler) Screenshot(c *gin.Context) {
	serial := c.Param("serial")

	png, err := h.deviceManager.Screenshot(c.Request.Context(), serial)
	if err != nil {
		h.logger.Error("failed to capture screenshot", "serial", serial, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to capture screenshot"})
		return
	}

	c.Data(http.StatusOK, "image/png", png)
}
