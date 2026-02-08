# Batter

Remote Android phone management platform. View, control, and manage multiple Android devices from a web browser using low-latency H.264 video streaming over WebSocket.

![Dashboard](docs/screenshot-dashboard.png)

![Users](docs/screenshot-users.png)
![Groups](docs/screenshot-groups.png)

## Features

- **Live video streaming** - Real-time H.264 video from Android devices via scrcpy, decoded in-browser with WebCodecs API
- **Touch & keyboard control** - Full remote control with touch, scroll, and keyboard input forwarding
- **Device grid** - Dashboard with live thumbnail previews for all connected devices
- **Adaptive quality** - Automatic thumbnail (360p/5fps) and full-quality (1024p/30fps) session tiers
- **Screenshot cache** - Cached last screenshot shown when devices are disconnected or sessions are idle
- **Device registration** - Guided wizard to register, validate, and probe device properties
- **Device groups** - Organize devices into groups with batch session start/stop, per-group access grants
- **Teams** - Group users into teams and grant team-level access to devices and device groups
- **User management** - Role-based access control (admin, operator, viewer) with expandable user cards, access overview, and password reset
- **RBAC** - Per-device, per-group, and per-team access permissions (view, control, manage) for non-admin users
- **Tabbed card UI** - Consistent expandable card design with tabbed views across Users, Teams, and Device Groups pages

## Architecture

```
Browser (Next.js)  <--HTTP/WS-->  Go Backend  <--ADB/scrcpy-->  Android Devices
                                      |
                                  PostgreSQL
```

| Component | Technology |
|-----------|-----------|
| Backend | Go 1.24, Gin, gorilla/websocket, pgx/v5 |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Database | PostgreSQL 16 |
| Streaming | scrcpy-server (H.264), WebCodecs VideoDecoder |
| Auth | JWT (access + refresh tokens), bcrypt |

## Prerequisites

- Go 1.24+
- Node.js 20+
- Docker (for PostgreSQL)
- ADB (Android Debug Bridge)
- scrcpy-server binary (v3.x)
- Android device(s) with USB debugging enabled

## Quick Start

### 1. Start the database

```bash
make db-up
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET to a random string (32+ chars)
```

### 3. Start the backend

```bash
make dev
```

### 4. Start the frontend

```bash
cd web && npm install && npm run dev
```

### 5. Open the browser

Navigate to `http://localhost:3000`. On first launch, you'll be prompted to create an admin account.

## Docker

Run the full stack with Docker Compose:

```bash
docker compose up -d
```

This starts PostgreSQL, the Go backend, and the Next.js frontend. The container needs `privileged: true` and access to `/dev/bus/usb` for ADB.

## Project Structure

```
cmd/batter/              # Application entrypoint
internal/
  api/
    handlers/            # HTTP + WebSocket handlers (devices, groups, users, teams)
    middleware/           # Auth, CORS, RBAC, audit logging middleware
    router.go            # Route definitions
  auth/                  # JWT + password hashing
  config/                # Environment config
  device/                # ADB, scrcpy sessions, screenshot cache
db/migrations/           # PostgreSQL schema migrations (auto-applied)
web/                     # Next.js frontend
  src/
    app/
      dashboard/         # Device grid with live thumbnails
      devices/[serial]/  # Full-screen device viewer
      groups/            # Device groups management
      admin/users/       # User management (admin)
      admin/user-groups/ # Team management (admin)
    components/          # React components (device cards, wizard, layout)
    lib/                 # API client, auth, video players
scripts/                 # Utility scripts
```

## API

All endpoints are prefixed with `/api/v1` and require JWT authentication (except auth routes).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login, returns access + refresh tokens |
| POST | `/auth/refresh` | Refresh access token |
| GET | `/auth/me` | Get current user info |
| GET | `/devices` | List registered devices with live status |
| POST | `/devices` | Register a new device |
| GET | `/devices/:serial` | Get single device info |
| PUT | `/devices/:serial` | Update device nickname/properties |
| DELETE | `/devices/:serial` | Delete device |
| POST | `/devices/:serial/session/start` | Start scrcpy session |
| POST | `/devices/:serial/session/stop` | Stop session |
| POST | `/devices/:serial/session/upgrade` | Switch to full quality |
| POST | `/devices/:serial/session/downgrade` | Switch to thumbnail quality |
| GET | `/devices/:serial/screenshot` | Get device screenshot (live or cached) |
| GET | `/groups` | List device groups |
| POST | `/groups` | Create device group |
| PUT | `/groups/:id` | Update group name/description/color |
| DELETE | `/groups/:id` | Delete device group |
| GET | `/groups/:id/devices` | List devices in group |
| POST | `/groups/:id/devices` | Add devices to group |
| DELETE | `/groups/:id/devices/:serial` | Remove device from group |
| POST | `/groups/:id/batch/start` | Batch start sessions |
| POST | `/groups/:id/batch/stop` | Batch stop sessions |
| GET | `/groups/:id/access` | List user access grants for group |
| DELETE | `/groups/:id/access/:accessId` | Revoke user access grant |
| GET | `/groups/:id/team-access` | List team access grants for group |
| POST | `/groups/:id/team-access` | Grant team access to group |
| DELETE | `/groups/:id/team-access/:accessId` | Revoke team access grant |
| GET | `/users` | List users (admin) |
| POST | `/users` | Create user (admin) |
| PUT | `/users/:id` | Update user role/status (admin) |
| DELETE | `/users/:id` | Delete user (admin) |
| GET | `/users/:id/devices` | List user's access grants (admin) |
| POST | `/users/:id/devices` | Grant device/group access to user (admin) |
| DELETE | `/users/:id/devices/:accessId` | Revoke user access (admin) |
| PUT | `/users/:id/password` | Reset user password (admin) |
| GET | `/user-groups` | List teams (admin) |
| POST | `/user-groups` | Create team (admin) |
| PUT | `/user-groups/:id` | Update team (admin) |
| DELETE | `/user-groups/:id` | Delete team (admin) |
| GET | `/user-groups/:id/members` | List team members (admin) |
| POST | `/user-groups/:id/members` | Add member to team (admin) |
| DELETE | `/user-groups/:id/members/:userId` | Remove member from team (admin) |
| GET | `/user-groups/:id/access` | List team's device access grants (admin) |
| POST | `/user-groups/:id/access` | Grant device access to team (admin) |
| DELETE | `/user-groups/:id/access/:accessId` | Revoke team device access (admin) |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `/ws/device/:serial/video` | H.264 video stream (binary frames) |
| `/ws/device/:serial/control` | Touch/keyboard input (JSON messages) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Backend HTTP port |
| `DATABASE_URL` | `postgres://batter:batter@localhost:5432/batter` | PostgreSQL connection string |
| `JWT_SECRET` | *(required)* | Secret for signing JWT tokens |
| `JWT_EXPIRY_SECS` | `3600` | Access token expiry in seconds |
| `SCRCPY_SERVER_PATH` | `/usr/local/share/scrcpy/scrcpy-server` | Path to scrcpy-server binary |
| `SCRCPY_VERSION` | `3.3.4` | scrcpy protocol version |
| `DATA_DIR` | `./data` | Directory for screenshot cache and runtime data |
| `ALLOWED_ORIGINS` | *(empty)* | Comma-separated CORS origins |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL for CORS |

## Development

```bash
# Run backend
make dev

# Run frontend (separate terminal)
cd web && npm run dev

# Run tests
make test

# Build binary
make build

# Lint
make lint
```

## License

Proprietary - XpertaDK
