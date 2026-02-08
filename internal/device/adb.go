package device

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
)

// ADBDevice represents a connected Android device.
type ADBDevice struct {
	Serial  string `json:"serial"`
	State   string `json:"state"`
	Model   string `json:"model"`
	Product string `json:"product"`
}

// ADB wraps adb command-line operations.
type ADB struct {
	adbPath string
	logger  *slog.Logger
}

// NewADB creates a new ADB wrapper, locating the adb binary in PATH.
func NewADB(logger *slog.Logger) (*ADB, error) {
	path, err := exec.LookPath("adb")
	if err != nil {
		return nil, fmt.Errorf("adb not found in PATH: %w", err)
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &ADB{
		adbPath: path,
		logger:  logger.With("component", "adb"),
	}, nil
}

// ListDevices returns all connected ADB devices.
func (a *ADB) ListDevices(ctx context.Context) ([]ADBDevice, error) {
	out, err := a.run(ctx, "devices", "-l")
	if err != nil {
		return nil, fmt.Errorf("adb devices: %w", err)
	}

	var devices []ADBDevice
	scanner := bufio.NewScanner(bytes.NewReader(out))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "List of") || strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		dev := ADBDevice{
			Serial: fields[0],
			State:  fields[1],
		}

		// Parse key:value properties like model:Pixel_6 product:oriole
		for _, f := range fields[2:] {
			parts := strings.SplitN(f, ":", 2)
			if len(parts) != 2 {
				continue
			}
			switch parts[0] {
			case "model":
				dev.Model = parts[1]
			case "product":
				dev.Product = parts[1]
			}
		}

		devices = append(devices, dev)
	}

	return devices, nil
}

// Push copies a local file to the device.
func (a *ADB) Push(ctx context.Context, serial, localPath, remotePath string) error {
	_, err := a.runWithSerial(ctx, serial, "push", localPath, remotePath)
	return err
}

// Forward sets up a TCP port forward to a device-side abstract socket.
func (a *ADB) Forward(ctx context.Context, serial string, localPort int, abstractName string) error {
	_, err := a.runWithSerial(ctx, serial, "forward",
		fmt.Sprintf("tcp:%d", localPort),
		fmt.Sprintf("localabstract:%s", abstractName),
	)
	return err
}

// RemoveForward removes a previously set up port forward.
func (a *ADB) RemoveForward(ctx context.Context, serial string, localPort int) error {
	_, err := a.runWithSerial(ctx, serial, "forward", "--remove", fmt.Sprintf("tcp:%d", localPort))
	return err
}

// Reverse sets up a reverse port forward: device-side abstract socket maps to host TCP port.
func (a *ADB) Reverse(ctx context.Context, serial string, abstractName string, localPort int) error {
	_, err := a.runWithSerial(ctx, serial, "reverse",
		fmt.Sprintf("localabstract:%s", abstractName),
		fmt.Sprintf("tcp:%d", localPort),
	)
	return err
}

// RemoveReverse removes a previously set up reverse forward.
func (a *ADB) RemoveReverse(ctx context.Context, serial string, abstractName string) error {
	_, err := a.runWithSerial(ctx, serial, "reverse", "--remove", fmt.Sprintf("localabstract:%s", abstractName))
	return err
}

// Shell executes a shell command on the device.
func (a *ADB) Shell(ctx context.Context, serial string, args ...string) ([]byte, error) {
	cmdArgs := append([]string{"shell"}, args...)
	return a.runWithSerial(ctx, serial, cmdArgs...)
}

// Screenshot captures the device screen as a PNG.
func (a *ADB) Screenshot(ctx context.Context, serial string) ([]byte, error) {
	return a.runWithSerial(ctx, serial, "exec-out", "screencap", "-p")
}

func (a *ADB) run(ctx context.Context, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, a.adbPath, args...)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("adb %s: %s", strings.Join(args, " "), string(exitErr.Stderr))
		}
		return nil, err
	}
	return out, nil
}

func (a *ADB) runWithSerial(ctx context.Context, serial string, args ...string) ([]byte, error) {
	cmdArgs := append([]string{"-s", serial}, args...)
	return a.run(ctx, cmdArgs...)
}
