package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/XpertaDK/batter/internal/api"
	"github.com/XpertaDK/batter/internal/api/handlers"
	"github.com/XpertaDK/batter/internal/auth"
	"github.com/XpertaDK/batter/internal/config"
	"github.com/XpertaDK/batter/internal/device"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// Connect to database
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := handlers.ConnectDB(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("connected to database")

	// Initialize device manager
	dm, err := device.NewManager(device.ManagerConfig{
		ScrcpyServerPath:   cfg.ScrcpyServerPath,
		ScrcpyVersion:      cfg.ScrcpyVersion,
		ScreenshotCacheDir: cfg.DataDir,
		Logger:             logger,
	})
	if err != nil {
		logger.Error("failed to initialize device manager", "error", err)
		os.Exit(1)
	}

	// Initialize JWT manager
	jwtManager := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpirySecs)

	// Set up router
	router := api.NewRouter(api.RouterConfig{
		DeviceManager:  dm,
		DB:             db,
		JWTManager:     jwtManager,
		Logger:         logger,
		AllowedOrigins: cfg.AllowedOrigins,
	})

	// Start session health checker (cleans up dead sessions every 30s)
	stopHealthCheck := dm.StartHealthChecker(30 * time.Second)

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	logger.Info("starting batter server", "addr", addr)

	go func() {
		if err := router.Run(addr); err != nil {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-quit
	logger.Info("shutting down...")
	stopHealthCheck()
	dm.Shutdown()
	logger.Info("shutdown complete")
}
