package handlers

import (
	"log/slog"
	"net/http"

	"github.com/XpertaDK/batter/internal/device"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GroupHandler handles device group API requests.
type GroupHandler struct {
	db            *pgxpool.Pool
	deviceManager *device.Manager
	logger        *slog.Logger
}

// NewGroupHandler creates a new group handler.
func NewGroupHandler(db *pgxpool.Pool, dm *device.Manager, logger *slog.Logger) *GroupHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &GroupHandler{
		db:            db,
		deviceManager: dm,
		logger:        logger.With("handler", "groups"),
	}
}

// ListGroups returns all device groups.
func (h *GroupHandler) ListGroups(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(),
		"SELECT id, name, COALESCE(description, ''), COALESCE(color, '#6366f1'), created_at FROM device_groups ORDER BY name",
	)
	if err != nil {
		h.logger.Error("failed to list groups", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list groups"})
		return
	}
	defer rows.Close()

	var groups []gin.H
	for rows.Next() {
		var id, name, description, color string
		var createdAt interface{}
		if err := rows.Scan(&id, &name, &description, &color, &createdAt); err != nil {
			continue
		}

		// Count members
		var memberCount int
		_ = h.db.QueryRow(c.Request.Context(),
			"SELECT count(*) FROM device_group_members WHERE group_id = $1", id,
		).Scan(&memberCount)

		groups = append(groups, gin.H{
			"id":           id,
			"name":         name,
			"description":  description,
			"color":        color,
			"member_count": memberCount,
			"created_at":   createdAt,
		})
	}

	if groups == nil {
		groups = []gin.H{}
	}

	c.JSON(http.StatusOK, gin.H{"groups": groups})
}

// CreateGroupRequest represents a request to create a group.
type CreateGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Color       string `json:"color"`
}

// CreateGroup creates a new device group.
func (h *GroupHandler) CreateGroup(c *gin.Context) {
	var req CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	userID, _ := c.Get("user_id")
	color := req.Color
	if color == "" {
		color = "#6366f1"
	}

	var groupID string
	err := h.db.QueryRow(c.Request.Context(),
		"INSERT INTO device_groups (name, description, color, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
		req.Name, req.Description, color, userID,
	).Scan(&groupID)
	if err != nil {
		h.logger.Error("failed to create group", "error", err)
		c.JSON(http.StatusConflict, gin.H{"error": "group name already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":   groupID,
		"name": req.Name,
	})
}

// DeleteGroup deletes a device group.
func (h *GroupHandler) DeleteGroup(c *gin.Context) {
	groupID := c.Param("id")

	_, err := h.db.Exec(c.Request.Context(), "DELETE FROM device_groups WHERE id = $1", groupID)
	if err != nil {
		h.logger.Error("failed to delete group", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete group"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "group deleted"})
}

// AddDevicesRequest represents a request to add devices to a group.
type AddDevicesRequest struct {
	Serials []string `json:"serials" binding:"required"`
}

// AddDevices adds devices to a group.
func (h *GroupHandler) AddDevices(c *gin.Context) {
	groupID := c.Param("id")

	var req AddDevicesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "serials array is required"})
		return
	}

	for _, serial := range req.Serials {
		// Ensure device exists in devices table first
		_, _ = h.db.Exec(c.Request.Context(),
			"INSERT INTO devices (serial) VALUES ($1) ON CONFLICT DO NOTHING", serial,
		)
		_, err := h.db.Exec(c.Request.Context(),
			"INSERT INTO device_group_members (device_serial, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
			serial, groupID,
		)
		if err != nil {
			h.logger.Warn("failed to add device to group", "serial", serial, "group_id", groupID, "error", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "devices added"})
}

// RemoveDevice removes a device from a group.
func (h *GroupHandler) RemoveDevice(c *gin.Context) {
	groupID := c.Param("id")
	serial := c.Param("serial")

	_, err := h.db.Exec(c.Request.Context(),
		"DELETE FROM device_group_members WHERE device_serial = $1 AND group_id = $2",
		serial, groupID,
	)
	if err != nil {
		h.logger.Error("failed to remove device from group", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "device removed"})
}

// GetGroupDevices returns all devices in a group.
func (h *GroupHandler) GetGroupDevices(c *gin.Context) {
	groupID := c.Param("id")

	rows, err := h.db.Query(c.Request.Context(),
		"SELECT device_serial FROM device_group_members WHERE group_id = $1", groupID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list group devices"})
		return
	}
	defer rows.Close()

	var serials []string
	for rows.Next() {
		var serial string
		if err := rows.Scan(&serial); err != nil {
			continue
		}
		serials = append(serials, serial)
	}
	if serials == nil {
		serials = []string{}
	}

	c.JSON(http.StatusOK, gin.H{"serials": serials})
}

// BatchStartRequest specifies optional session parameters for batch operations.
type BatchStartRequest struct {
	MaxSize int `json:"max_size"`
	MaxFPS  int `json:"max_fps"`
}

// BatchStart starts sessions for all devices in a group.
func (h *GroupHandler) BatchStart(c *gin.Context) {
	groupID := c.Param("id")

	var req BatchStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req = BatchStartRequest{}
	}

	rows, err := h.db.Query(c.Request.Context(),
		"SELECT device_serial FROM device_group_members WHERE group_id = $1", groupID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list group devices"})
		return
	}
	defer rows.Close()

	var started, failed int
	for rows.Next() {
		var serial string
		if err := rows.Scan(&serial); err != nil {
			continue
		}
		_, err := h.deviceManager.StartSession(c.Request.Context(), serial, device.SessionOptions{
			MaxSize: req.MaxSize,
			MaxFPS:  req.MaxFPS,
		})
		if err != nil {
			h.logger.Warn("batch start failed", "serial", serial, "error", err)
			failed++
		} else {
			started++
		}
	}

	c.JSON(http.StatusOK, gin.H{"started": started, "failed": failed})
}

// BatchStop stops sessions for all devices in a group.
func (h *GroupHandler) BatchStop(c *gin.Context) {
	groupID := c.Param("id")

	rows, err := h.db.Query(c.Request.Context(),
		"SELECT device_serial FROM device_group_members WHERE group_id = $1", groupID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list group devices"})
		return
	}
	defer rows.Close()

	var stopped, failed int
	for rows.Next() {
		var serial string
		if err := rows.Scan(&serial); err != nil {
			continue
		}
		if err := h.deviceManager.StopSession(serial); err != nil {
			failed++
		} else {
			stopped++
		}
	}

	c.JSON(http.StatusOK, gin.H{"stopped": stopped, "failed": failed})
}
