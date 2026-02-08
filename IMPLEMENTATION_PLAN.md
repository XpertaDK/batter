## Stage 1: Project Scaffolding + Device Core
**Goal**: Go binary that lists ADB devices and streams video via WebSocket (no auth yet).
**Success Criteria**: `go test ./...` passes; `curl /api/v1/devices` returns devices.
**Tests**: Protocol encoding tests from SunSet pass verbatim.
**Status**: Complete

## Stage 2: User Authentication
**Goal**: JWT login, protected routes, first-run admin setup.
**Success Criteria**: Login returns JWT; unauthenticated requests rejected; WebSocket requires token.
**Tests**: Auth middleware tests, JWT validation tests.
**Status**: Complete

## Stage 3: Frontend + Grid View
**Goal**: Next.js app with login, device grid dashboard, single device viewer.
**Success Criteria**: Login → grid of live thumbnails → click → full-quality device view + control.
**Tests**: Visual verification in browser.
**Status**: Complete

## Stage 4: Two-Tier Video Quality
**Goal**: Grid uses 360p/5fps, focused view uses 1024p/30fps, automatic transitions.
**Success Criteria**: Quality visibly changes between grid and detail view.
**Tests**: Reference count correctness.
**Status**: Complete

## Stage 5: Device Groups + Batch Operations
**Goal**: Named groups, batch start/stop/wake, group filter on grid.
**Success Criteria**: Create group → add devices → batch start → filter grid by group.
**Tests**: Group CRUD tests.
**Status**: Complete

## Stage 6: RBAC + Permissions
**Goal**: Non-admin users see only assigned devices. Viewers can't control.
**Success Criteria**: Operator sees only assigned devices; viewer can watch but not control.
**Tests**: Permission middleware tests.
**Status**: Complete

## Stage 7: Polish + Production
**Goal**: Audit logging, health monitoring, Docker production setup.
**Success Criteria**: Production Docker compose runs successfully.
**Tests**: End-to-end health check.
**Status**: Complete
