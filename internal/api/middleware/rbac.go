package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RBAC returns middleware that checks device-level permissions.
// Admin users bypass all checks.
type RBACConfig struct {
	DB *pgxpool.Pool
}

// RequireDevicePermission checks that the user has at least the given permission
// for the device specified by :serial parameter.
// Admins bypass this check entirely.
func RequireDevicePermission(db *pgxpool.Pool, minPermission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(ContextKeyRole)
		if role == "admin" {
			c.Next()
			return
		}

		userID, _ := c.Get(ContextKeyUserID)
		serial := c.Param("serial")
		if serial == "" {
			c.Next()
			return
		}

		hasAccess, err := checkDeviceAccess(c, db, userID.(string), serial, minPermission)
		if err != nil || !hasAccess {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "no access to this device"})
			return
		}

		c.Next()
	}
}

// checkDeviceAccess verifies if a user has the specified permission for a device.
// Checks both direct device grants and group-based grants.
func checkDeviceAccess(c *gin.Context, db *pgxpool.Pool, userID, serial, minPermission string) (bool, error) {
	permLevel := permissionLevel(minPermission)

	// Check direct device access
	rows, err := db.Query(c.Request.Context(),
		"SELECT permission FROM user_device_access WHERE user_id = $1 AND device_serial = $2",
		userID, serial,
	)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var perm string
		if err := rows.Scan(&perm); err != nil {
			continue
		}
		if permissionLevel(perm) >= permLevel {
			return true, nil
		}
	}

	// Check group-based access
	rows2, err := db.Query(c.Request.Context(), `
		SELECT a.permission FROM user_device_access a
		JOIN device_group_members m ON m.group_id = a.group_id
		WHERE a.user_id = $1 AND m.device_serial = $2 AND a.group_id IS NOT NULL
	`, userID, serial)
	if err != nil {
		return false, err
	}
	defer rows2.Close()

	for rows2.Next() {
		var perm string
		if err := rows2.Scan(&perm); err != nil {
			continue
		}
		if permissionLevel(perm) >= permLevel {
			return true, nil
		}
	}

	return false, nil
}

// GetAccessibleSerials returns all device serials the user has access to.
// Returns nil for admin users (meaning all devices).
func GetAccessibleSerials(c *gin.Context, db *pgxpool.Pool, userID, role string) ([]string, error) {
	if role == "admin" {
		return nil, nil // nil means all access
	}

	rows, err := db.Query(c.Request.Context(), `
		SELECT DISTINCT device_serial FROM user_device_access
		WHERE user_id = $1 AND device_serial IS NOT NULL
		UNION
		SELECT DISTINCT m.device_serial FROM user_device_access a
		JOIN device_group_members m ON m.group_id = a.group_id
		WHERE a.user_id = $1 AND a.group_id IS NOT NULL
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var serials []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			continue
		}
		serials = append(serials, s)
	}

	if serials == nil {
		serials = []string{}
	}

	return serials, nil
}

func permissionLevel(p string) int {
	switch p {
	case "view":
		return 0
	case "control":
		return 1
	case "manage":
		return 2
	default:
		return -1
	}
}
