-- name: GrantDeviceAccess :one
INSERT INTO user_device_access (user_id, device_serial, permission, granted_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GrantGroupAccess :one
INSERT INTO user_device_access (user_id, group_id, permission, granted_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: RevokeAccess :exec
DELETE FROM user_device_access WHERE id = $1;

-- name: ListUserAccess :many
SELECT * FROM user_device_access WHERE user_id = $1;

-- name: GetUserDevicePermission :many
SELECT permission FROM user_device_access
WHERE user_id = $1 AND device_serial = $2;

-- name: GetUserGroupPermission :many
SELECT permission FROM user_device_access
WHERE user_id = $1 AND group_id = $2;

-- name: ListAccessibleDeviceSerials :many
SELECT DISTINCT device_serial FROM user_device_access
WHERE user_id = $1 AND device_serial IS NOT NULL
UNION
SELECT DISTINCT m.device_serial FROM user_device_access a
JOIN device_group_members m ON m.group_id = a.group_id
WHERE a.user_id = $1 AND a.group_id IS NOT NULL;

-- name: CreateAuthSession :one
INSERT INTO auth_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetAuthSession :one
SELECT * FROM auth_sessions WHERE refresh_token_hash = $1 AND expires_at > now();

-- name: DeleteAuthSession :exec
DELETE FROM auth_sessions WHERE id = $1;

-- name: DeleteUserAuthSessions :exec
DELETE FROM auth_sessions WHERE user_id = $1;
