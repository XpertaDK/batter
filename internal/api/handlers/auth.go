package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"

	"github.com/XpertaDK/batter/internal/auth"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuthHandler handles authentication API requests.
type AuthHandler struct {
	db         *pgxpool.Pool
	jwtManager *auth.JWTManager
	logger     *slog.Logger
}

// NewAuthHandler creates a new auth handler.
func NewAuthHandler(db *pgxpool.Pool, jwtManager *auth.JWTManager, logger *slog.Logger) *AuthHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &AuthHandler{
		db:         db,
		jwtManager: jwtManager,
		logger:     logger.With("handler", "auth"),
	}
}

// LoginRequest represents a login request.
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login authenticates a user and returns JWT tokens.
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password are required"})
		return
	}

	// Look up user
	var userID, passwordHash, role, displayName string
	var isActive bool
	err := h.db.QueryRow(c.Request.Context(),
		"SELECT id, password_hash, role, COALESCE(display_name, username), is_active FROM users WHERE username = $1",
		req.Username,
	).Scan(&userID, &passwordHash, &role, &displayName, &isActive)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !isActive {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "account is disabled"})
		return
	}

	if !auth.CheckPassword(req.Password, passwordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Generate tokens
	accessToken, err := h.jwtManager.GenerateToken(userID, req.Username, role)
	if err != nil {
		h.logger.Error("failed to generate access token", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	refreshToken, err := h.jwtManager.GenerateRefreshToken(userID)
	if err != nil {
		h.logger.Error("failed to generate refresh token", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	// Store refresh token hash
	tokenHash := hashToken(refreshToken)
	_, err = h.db.Exec(c.Request.Context(),
		"INSERT INTO auth_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at) VALUES ($1, $2, $3, $4, $5)",
		userID, tokenHash, c.Request.UserAgent(), c.ClientIP(), time.Now().Add(7*24*time.Hour),
	)
	if err != nil {
		h.logger.Error("failed to store auth session", "error", err)
	}

	// Update last login
	_, _ = h.db.Exec(c.Request.Context(), "UPDATE users SET last_login_at = now() WHERE id = $1", userID)

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user": gin.H{
			"id":           userID,
			"username":     req.Username,
			"display_name": displayName,
			"role":         role,
		},
	})
}

// RefreshRequest represents a token refresh request.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// Refresh exchanges a refresh token for a new access token.
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refresh_token is required"})
		return
	}

	userID, err := h.jwtManager.ValidateRefreshToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}

	// Verify session exists in DB
	tokenHash := hashToken(req.RefreshToken)
	var sessionID string
	err = h.db.QueryRow(c.Request.Context(),
		"SELECT id FROM auth_sessions WHERE refresh_token_hash = $1 AND expires_at > now()",
		tokenHash,
	).Scan(&sessionID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "session expired or revoked"})
		return
	}

	// Look up user
	var username, role string
	var isActive bool
	err = h.db.QueryRow(c.Request.Context(),
		"SELECT username, role, is_active FROM users WHERE id = $1",
		userID,
	).Scan(&username, &role, &isActive)
	if err != nil || !isActive {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found or disabled"})
		return
	}

	accessToken, err := h.jwtManager.GenerateToken(userID, username, role)
	if err != nil {
		h.logger.Error("failed to generate access token", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": accessToken,
	})
}

// Logout revokes the user's refresh token.
func (h *AuthHandler) Logout(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "logged out"})
		return
	}

	tokenHash := hashToken(req.RefreshToken)
	_, _ = h.db.Exec(c.Request.Context(),
		"DELETE FROM auth_sessions WHERE refresh_token_hash = $1",
		tokenHash,
	)

	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// SetupRequest represents the first-run admin creation request.
type SetupRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Email    string `json:"email"`
}

// Setup creates the initial admin user. Only works when no users exist.
func (h *AuthHandler) Setup(c *gin.Context) {
	// Check if any users exist
	var count int64
	if err := h.db.QueryRow(c.Request.Context(), "SELECT count(*) FROM users").Scan(&count); err != nil {
		h.logger.Error("failed to count users", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "setup already completed"})
		return
	}

	var req SetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password are required"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var userID string
	err = h.db.QueryRow(c.Request.Context(),
		"INSERT INTO users (username, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, 'admin') RETURNING id",
		req.Username, req.Email, hash, req.Username,
	).Scan(&userID)
	if err != nil {
		h.logger.Error("failed to create admin user", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	h.logger.Info("admin user created via setup", "username", req.Username, "user_id", userID)

	c.JSON(http.StatusCreated, gin.H{
		"message": "admin user created",
		"user_id": userID,
	})
}

// NeedsSetup returns whether the system needs initial setup (no users exist).
func (h *AuthHandler) NeedsSetup(c *gin.Context) {
	var count int64
	if err := h.db.QueryRow(c.Request.Context(), "SELECT count(*) FROM users").Scan(&count); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"needs_setup": count == 0})
}

// Me returns the current authenticated user's info.
func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var username, role, displayName, email string
	err := h.db.QueryRow(c.Request.Context(),
		"SELECT username, role, COALESCE(display_name, username), COALESCE(email, '') FROM users WHERE id = $1",
		userID,
	).Scan(&username, &role, &displayName, &email)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           userID,
		"username":     username,
		"display_name": displayName,
		"email":        email,
		"role":         role,
	})
}

// ConnectDB tries to establish a connection to the database with a test query.
func ConnectDB(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return pool, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
