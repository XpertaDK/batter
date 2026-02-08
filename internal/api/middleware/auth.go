package middleware

import (
	"net/http"
	"strings"

	"github.com/XpertaDK/batter/internal/auth"
	"github.com/gin-gonic/gin"
)

const (
	// ContextKeyUserID is the key used to store user ID in gin context.
	ContextKeyUserID = "user_id"
	// ContextKeyUsername is the key used to store username in gin context.
	ContextKeyUsername = "username"
	// ContextKeyRole is the key used to store user role in gin context.
	ContextKeyRole = "role"
)

// Auth returns middleware that validates JWT tokens from the Authorization header.
func Auth(jwtManager *auth.JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			return
		}

		claims, err := jwtManager.ValidateToken(parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set(ContextKeyUserID, claims.UserID)
		c.Set(ContextKeyUsername, claims.Username)
		c.Set(ContextKeyRole, claims.Role)
		c.Next()
	}
}

// WSAuth validates a JWT token from the ?token= query parameter for WebSocket connections.
func WSAuth(jwtManager *auth.JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Query("token")
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token query parameter required"})
			return
		}

		claims, err := jwtManager.ValidateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set(ContextKeyUserID, claims.UserID)
		c.Set(ContextKeyUsername, claims.Username)
		c.Set(ContextKeyRole, claims.Role)
		c.Next()
	}
}

// RequireRole returns middleware that checks for a minimum role.
// Role hierarchy: admin > operator > viewer
func RequireRole(minRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get(ContextKeyRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
			return
		}

		if !hasMinRole(role.(string), minRole) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			return
		}

		c.Next()
	}
}

func hasMinRole(userRole, required string) bool {
	roleLevel := map[string]int{
		"viewer":   0,
		"operator": 1,
		"admin":    2,
	}

	userLevel, ok := roleLevel[userRole]
	if !ok {
		return false
	}
	requiredLevel, ok := roleLevel[required]
	if !ok {
		return false
	}
	return userLevel >= requiredLevel
}
