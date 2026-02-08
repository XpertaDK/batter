package device

import (
	"fmt"
	"os"
	"path/filepath"
)

// ScreenshotCache saves and loads device screenshots as PNG files on disk.
type ScreenshotCache struct {
	dir string
}

// NewScreenshotCache creates a new screenshot cache that stores PNGs in the given directory.
// The directory is created if it doesn't exist.
func NewScreenshotCache(dataDir string) (*ScreenshotCache, error) {
	dir := filepath.Join(dataDir, "screenshots")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create screenshot cache dir: %w", err)
	}
	return &ScreenshotCache{dir: dir}, nil
}

// Save writes a PNG screenshot to disk for the given device serial.
func (sc *ScreenshotCache) Save(serial string, png []byte) error {
	path := sc.path(serial)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, png, 0644); err != nil {
		return fmt.Errorf("write screenshot cache: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("rename screenshot cache: %w", err)
	}
	return nil
}

// Load reads a cached PNG screenshot from disk. Returns os.ErrNotExist if none cached.
func (sc *ScreenshotCache) Load(serial string) ([]byte, error) {
	return os.ReadFile(sc.path(serial))
}

// Delete removes a cached screenshot from disk. No error if it doesn't exist.
func (sc *ScreenshotCache) Delete(serial string) error {
	err := os.Remove(sc.path(serial))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (sc *ScreenshotCache) path(serial string) string {
	return filepath.Join(sc.dir, serial+".png")
}
