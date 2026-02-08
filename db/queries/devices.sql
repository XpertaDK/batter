-- name: UpsertDevice :exec
INSERT INTO devices (serial, model, product, last_seen_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (serial) DO UPDATE SET
    model = EXCLUDED.model,
    product = EXCLUDED.product,
    last_seen_at = now(),
    updated_at = now();

-- name: GetDevice :one
SELECT * FROM devices WHERE serial = $1;

-- name: ListDevices :many
SELECT * FROM devices ORDER BY last_seen_at DESC;

-- name: UpdateDeviceNickname :exec
UPDATE devices SET nickname = $2, updated_at = now() WHERE serial = $1;

-- name: DeleteDevice :exec
DELETE FROM devices WHERE serial = $1;
