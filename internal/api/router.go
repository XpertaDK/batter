package api

import (
	"log/slog"

	"github.com/XpertaDK/batter/internal/api/handlers"
	"github.com/XpertaDK/batter/internal/api/middleware"
	"github.com/XpertaDK/batter/internal/auth"
	"github.com/XpertaDK/batter/internal/device"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RouterConfig holds dependencies for setting up routes.
type RouterConfig struct {
	DeviceManager  *device.Manager
	DB             *pgxpool.Pool
	JWTManager     *auth.JWTManager
	Logger         *slog.Logger
	AllowedOrigins []string
}

// NewRouter creates and configures the Gin router with all routes.
func NewRouter(cfg RouterConfig) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// Global middleware
	r.Use(gin.Recovery())
	r.Use(middleware.Logger(cfg.Logger))
	r.Use(middleware.CORS(middleware.CORSConfig{
		AllowedOrigins: cfg.AllowedOrigins,
	}))

	// Health check (unauthenticated)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Handlers
	authHandler := handlers.NewAuthHandler(cfg.DB, cfg.JWTManager, cfg.Logger)
	deviceHandler := handlers.NewDeviceHandler(cfg.DeviceManager, cfg.Logger)
	deviceWSHandler := handlers.NewDeviceWSHandler(cfg.DeviceManager, cfg.Logger)
	userHandler := handlers.NewUserHandler(cfg.DB, cfg.Logger)
	groupHandler := handlers.NewGroupHandler(cfg.DB, cfg.DeviceManager, cfg.Logger)

	// API v1
	v1 := r.Group("/api/v1")
	{
		// Public auth routes
		v1.GET("/auth/needs-setup", authHandler.NeedsSetup)
		v1.POST("/admin/setup", authHandler.Setup)
		v1.POST("/auth/login", authHandler.Login)
		v1.POST("/auth/refresh", authHandler.Refresh)
		v1.POST("/auth/logout", authHandler.Logout)

		// Protected routes
		protected := v1.Group("")
		protected.Use(middleware.Auth(cfg.JWTManager))
		protected.Use(middleware.AuditLog(cfg.DB))
		{
			// Current user
			protected.GET("/auth/me", authHandler.Me)

			// Devices
			devices := protected.Group("/devices")
			{
				devices.GET("", deviceHandler.ListDevices)
				devices.GET("/health", deviceHandler.DeviceHealth)

				// Per-device endpoints require at least "view" permission
				deviceBySerial := devices.Group("/:serial")
				deviceBySerial.Use(middleware.RequireDevicePermission(cfg.DB, "view"))
				{
					deviceBySerial.GET("", deviceHandler.GetDevice)
					deviceBySerial.GET("/screenshot", deviceHandler.Screenshot)
					deviceBySerial.POST("/session/start", deviceHandler.StartSession)
					deviceBySerial.POST("/session/stop", deviceHandler.StopSession)
					deviceBySerial.POST("/session/upgrade", deviceHandler.UpgradeSession)
					deviceBySerial.POST("/session/downgrade", deviceHandler.DowngradeSession)
					deviceBySerial.POST("/wake", deviceHandler.WakeScreen)
				}
			}

			// Groups
			groups := protected.Group("/groups")
			{
				groups.GET("", groupHandler.ListGroups)
				groups.POST("", groupHandler.CreateGroup)
				groups.DELETE("/:id", groupHandler.DeleteGroup)
				groups.GET("/:id/devices", groupHandler.GetGroupDevices)
				groups.POST("/:id/devices", groupHandler.AddDevices)
				groups.DELETE("/:id/devices/:serial", groupHandler.RemoveDevice)
				groups.POST("/:id/batch/start", groupHandler.BatchStart)
				groups.POST("/:id/batch/stop", groupHandler.BatchStop)
			}

			// Users (admin only)
			users := protected.Group("/users")
			users.Use(middleware.RequireRole("admin"))
			{
				users.GET("", userHandler.ListUsers)
				users.POST("", userHandler.CreateUser)
				users.POST("/:id/devices", userHandler.GrantAccess)
			}
		}
	}

	// WebSocket endpoints (JWT via query param)
	wsGroup := r.Group("/ws")
	wsGroup.Use(middleware.WSAuth(cfg.JWTManager))
	{
		// Video: requires "view" permission
		wsGroup.GET("/device/:serial/video",
			middleware.RequireDevicePermission(cfg.DB, "view"),
			deviceWSHandler.VideoStream,
		)
		// Control: requires "control" permission (viewers can watch but not control)
		wsGroup.GET("/device/:serial/control",
			middleware.RequireDevicePermission(cfg.DB, "control"),
			deviceWSHandler.ControlStream,
		)
	}

	return r
}
