package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

// Logger returns middleware that logs HTTP requests.
func Logger(logger *slog.Logger) gin.HandlerFunc {
	if logger == nil {
		logger = slog.Default()
	}

	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		attrs := []any{
			"status", status,
			"method", c.Request.Method,
			"path", path,
			"latency_ms", latency.Milliseconds(),
			"client_ip", c.ClientIP(),
		}

		if query != "" {
			attrs = append(attrs, "query", query)
		}

		if len(c.Errors) > 0 {
			attrs = append(attrs, "errors", c.Errors.String())
		}

		switch {
		case status >= 500:
			logger.Error("request failed", attrs...)
		case status >= 400:
			logger.Warn("request error", attrs...)
		default:
			logger.Debug("request completed", attrs...)
		}
	}
}
