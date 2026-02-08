-- name: CreateGroup :one
INSERT INTO device_groups (name, description, color, created_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetGroup :one
SELECT * FROM device_groups WHERE id = $1;

-- name: ListGroups :many
SELECT * FROM device_groups ORDER BY name;

-- name: UpdateGroup :exec
UPDATE device_groups SET
    name = COALESCE($2, name),
    description = COALESCE($3, description),
    color = COALESCE($4, color),
    updated_at = now()
WHERE id = $1;

-- name: DeleteGroup :exec
DELETE FROM device_groups WHERE id = $1;

-- name: AddDeviceToGroup :exec
INSERT INTO device_group_members (device_serial, group_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveDeviceFromGroup :exec
DELETE FROM device_group_members WHERE device_serial = $1 AND group_id = $2;

-- name: ListGroupDevices :many
SELECT device_serial FROM device_group_members WHERE group_id = $1;

-- name: ListDeviceGroups :many
SELECT g.* FROM device_groups g
JOIN device_group_members m ON m.group_id = g.id
WHERE m.device_serial = $1;
