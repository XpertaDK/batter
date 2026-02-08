package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all application configuration.
type Config struct {
	// Server
	Port int
	Host string

	// Database
	DatabaseURL string

	// Device
	ScrcpyServerPath string
	ScrcpyVersion    string

	// Auth
	JWTSecret       string
	JWTExpirySecs   int
	AllowedOrigins  []string

	// Frontend
	FrontendURL string
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		Port:             getEnvInt("PORT", 8080),
		Host:             getEnv("HOST", "0.0.0.0"),
		DatabaseURL:      getEnv("DATABASE_URL", "postgres://batter:batter@localhost:5432/batter?sslmode=disable"),
		ScrcpyServerPath: getEnv("SCRCPY_SERVER_PATH", "/usr/local/share/scrcpy/scrcpy-server"),
		ScrcpyVersion:    getEnv("SCRCPY_VERSION", "3.3.4"),
		JWTSecret:        getEnv("JWT_SECRET", ""),
		JWTExpirySecs:    getEnvInt("JWT_EXPIRY_SECS", 3600),
		FrontendURL:      getEnv("FRONTEND_URL", "http://localhost:3000"),
	}

	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET environment variable is required")
	}

	// Parse allowed origins
	if origins := getEnv("ALLOWED_ORIGINS", ""); origins != "" {
		for _, o := range splitAndTrim(origins) {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if n, err := strconv.Atoi(val); err == nil {
			return n
		}
	}
	return fallback
}

func splitAndTrim(s string) []string {
	var result []string
	for _, part := range split(s, ",") {
		trimmed := trim(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func split(s, sep string) []string {
	var parts []string
	for {
		i := indexOf(s, sep)
		if i < 0 {
			parts = append(parts, s)
			break
		}
		parts = append(parts, s[:i])
		s = s[i+len(sep):]
	}
	return parts
}

func indexOf(s, sub string) int {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func trim(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
