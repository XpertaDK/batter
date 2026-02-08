package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJWTRoundTrip(t *testing.T) {
	m := NewJWTManager("test-secret-key-at-least-32-chars!", 3600)

	token, err := m.GenerateToken("user-123", "admin", "admin")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	claims, err := m.ValidateToken(token)
	require.NoError(t, err)
	assert.Equal(t, "user-123", claims.UserID)
	assert.Equal(t, "admin", claims.Username)
	assert.Equal(t, "admin", claims.Role)
	assert.Equal(t, "batter", claims.Issuer)
}

func TestJWTInvalidSecret(t *testing.T) {
	m1 := NewJWTManager("secret-one-at-least-32-characters", 3600)
	m2 := NewJWTManager("secret-two-at-least-32-characters", 3600)

	token, err := m1.GenerateToken("user-123", "admin", "admin")
	require.NoError(t, err)

	_, err = m2.ValidateToken(token)
	assert.Error(t, err)
}

func TestRefreshTokenRoundTrip(t *testing.T) {
	m := NewJWTManager("test-secret-key-at-least-32-chars!", 3600)

	token, err := m.GenerateRefreshToken("user-456")
	require.NoError(t, err)

	userID, err := m.ValidateRefreshToken(token)
	require.NoError(t, err)
	assert.Equal(t, "user-456", userID)
}

func TestRefreshTokenCannotBeUsedAsAccess(t *testing.T) {
	m := NewJWTManager("test-secret-key-at-least-32-chars!", 3600)

	refreshToken, err := m.GenerateRefreshToken("user-123")
	require.NoError(t, err)

	// Refresh token should fail access token validation (different claims structure)
	_, err = m.ValidateToken(refreshToken)
	assert.Error(t, err)
}

func TestPasswordHashAndCheck(t *testing.T) {
	hash, err := HashPassword("mysecurepassword")
	require.NoError(t, err)
	assert.NotEmpty(t, hash)

	assert.True(t, CheckPassword("mysecurepassword", hash))
	assert.False(t, CheckPassword("wrongpassword", hash))
}

func TestPasswordTooShort(t *testing.T) {
	_, err := HashPassword("short")
	assert.Error(t, err)
}
