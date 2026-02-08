-- name: CreateUser :one
INSERT INTO users (username, email, password_hash, display_name, role)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: ListUsers :many
SELECT * FROM users ORDER BY created_at DESC;

-- name: UpdateUserLastLogin :exec
UPDATE users SET last_login_at = now() WHERE id = $1;

-- name: CountUsers :one
SELECT count(*) FROM users;

-- name: UpdateUser :exec
UPDATE users SET
    email = COALESCE($2, email),
    display_name = COALESCE($3, display_name),
    role = COALESCE($4, role),
    is_active = COALESCE($5, is_active),
    updated_at = now()
WHERE id = $1;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;
