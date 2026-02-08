package middleware

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditLog returns middleware that logs significant API actions to the audit_log table.
// It captures the authenticated user, action, target device, and request details.
func AuditLog(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// Only audit mutating requests
		method := c.Request.Method
		if method == "GET" || method == "HEAD" || method == "OPTIONS" {
			return
		}

		// Only audit successful requests
		status := c.Writer.Status()
		if status >= 400 {
			return
		}

		userID, _ := c.Get(ContextKeyUserID)
		if userID == nil {
			return
		}

		serial := c.Param("serial")
		action := method + " " + c.FullPath()

		var serialPtr *string
		if serial != "" {
			serialPtr = &serial
		}

		details, _ := json.Marshal(map[string]interface{}{
			"path":      c.Request.URL.Path,
			"status":    status,
			"client_ip": c.ClientIP(),
		})

		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		_, _ = db.Exec(ctx,
			"INSERT INTO audit_log (user_id, action, device_serial, details) VALUES ($1, $2, $3, $4)",
			userID.(string), action, serialPtr, details,
		)
	}
}
