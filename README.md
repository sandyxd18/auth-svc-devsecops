# 🔐 Auth Service

Production-ready JWT authentication microservice built with **Bun**, **Express**, **PostgreSQL**, and **Prisma** — fully instrumented with metrics, logs, and distributed tracing via the Grafana observability stack.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Framework | Express.js |
| Database | PostgreSQL + Prisma |
| Auth | JWT (jsonwebtoken) |
| Password Hashing | bcryptjs (12 rounds) |
| Validation | Zod |
| Metrics | prom-client → Prometheus |
| Logs | Winston (JSON) → Alloy → Loki |
| Traces | OpenTelemetry → Alloy → Tempo |
| Visualization | Grafana |

---

## Project Structure

```
auth-service/
├── prisma/
│   └── schema.prisma              # users table schema
├── src/
│   ├── config/
│   │   └── env.ts                 # Env var validation & typed access
│   ├── controllers/
│   │   └── auth.controller.ts     # HTTP layer — parse, validate, respond
│   ├── db/
│   │   ├── prisma.ts              # Prisma client singleton
│   │   └── seed.ts                # Default admin seeder
│   ├── middleware/
│   │   ├── auth.ts                # authenticateJWT + authorizeRole
│   │   ├── errorHandler.ts        # Structured error logging
│   │   ├── rateLimiter.ts         # In-memory rate limiter per IP
│   │   └── requestLogger.ts       # HTTP log + Prometheus metrics per request
│   ├── routes/
│   │   └── auth.routes.ts         # Route definitions
│   ├── services/
│   │   └── auth.service.ts        # Business logic + auth metrics emission
│   ├── telemetry/
│   │   ├── logger.ts              # Winston JSON logger (injects trace_id/span_id)
│   │   ├── metrics.ts             # prom-client registry + metric definitions
│   │   └── tracer.ts              # OpenTelemetry SDK init (MUST load first)
│   ├── utils/
│   │   ├── jwt.ts                 # JWT sign/verify helpers
│   │   ├── recovery.ts            # Recovery key generation (RC-xxxx-xxxx-xxxx-xxxx)
│   │   ├── response.ts            # Standardized API response helpers
│   │   └── validators.ts          # Zod schemas
│   ├── app.ts                     # Express factory + /metrics endpoint
│   └── server.ts                  # Entry point (tracer imported first)
├── .dockerignore
├── .env.example
├── Dockerfile                     # Multi-stage production image
├── entrypoint.sh                  # DB sync + seed → start server
└── package.json
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL >= 14

### 1. Install

```bash
cd auth-service
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/auth_db"
JWT_SECRET="your-super-secret-key"
JWT_EXPIRES_IN="1h"
PORT=3000
NODE_ENV="development"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="Admin@1234!"

# Observability
SERVICE_NAME="auth-microservice"
SERVICE_VERSION="1.0.0"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
LOKI_HOST="http://localhost:3100"
```

### 3. Setup Database & Seed

```bash
bun run db:generate
bun run db:push
bun run seed
```

### 4. Start

```bash
bun run dev     # hot reload
bun run start   # production
```

---

## API Reference

### Endpoint Summary

| Method | Endpoint | Auth | Role | Rate Limit | Description |
|---|---|---|---|---|---|
| GET | `/health` | — | — | — | Health check |
| GET | `/metrics` | — | — | — | Prometheus metrics scrape |
| POST | `/auth/register` | — | — | 20/15min | Register new user |
| GET | `/auth/check-username` | — | — | 20/15min | Check if username is available |
| POST | `/auth/login` | — | — | 20/15min | Login, get JWT |
| GET | `/auth/me` | ✅ Cookie | user | — | Session restore (user_auth_token) |
| GET | `/auth/admin/me` | ✅ Cookie | admin | — | Session restore (admin_auth_token) |
| POST | `/auth/logout` | — | — | — | Clear auth cookies |
| POST | `/auth/forgot-password` | — | — | **5/15min** | Reset password via recovery key |
| GET | `/auth/profile` | ✅ JWT | any | — | Get own profile |
| PATCH | `/auth/password` | ✅ JWT | any | — | Update own password |
| DELETE | `/auth/account` | ✅ JWT | any | — | Delete own account |
| POST | `/auth/recovery-key/generate` | ✅ JWT | any | — | Generate first recovery key |
| POST | `/auth/recovery-key/regenerate` | ✅ JWT | any | — | Rotate (regenerate) recovery key |
| GET | `/auth/admin-only` | ✅ JWT | admin | — | Admin ping |
| GET | `/auth/admin/users` | ✅ JWT | admin | — | List all users |
| PATCH | `/auth/admin/users/:id/password` | ✅ JWT | admin | — | Force-reset user password |
| DELETE | `/auth/admin/users/:id` | ✅ JWT | admin | — | Delete any user |

---

### POST /auth/register

Register a new user account. Returns a **recovery key** that must be saved by the user — it is shown only once.

**Request:**
```json
{ "username": "alice", "password": "securepass123", "role": "user" }
```

**201 Created:**
```json
{
  "success": true,
  "message": "User registered successfully. Please save your recovery key — it will not be shown again.",
  "data": {
    "id": "uuid",
    "username": "alice",
    "role": "user",
    "created_at": "...",
    "recovery_key": "RC-a7f2-k9m3-x4p8-n2d6"
  }
}
```

> ⚠️ **The `recovery_key` is only returned during registration.** It is stored as a bcrypt hash in the database and cannot be retrieved later.

**409 Conflict:**
```json
{ "success": false, "error": "Username already taken" }
```

---

### POST /auth/login

Authenticate and receive a JWT token.

**Request:**
```json
{ "username": "alice", "password": "securepass123" }
```

**200 OK:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJ...",
    "user": { "id": "uuid", "username": "alice", "role": "user" },
    "has_recovery_key": true
  }
}
```

> The `has_recovery_key` field indicates whether the user has a recovery key set up. If `false`, the client should prompt the user to generate one via `POST /auth/recovery-key/generate`.

**401 Unauthorized:**
```json
{ "success": false, "error": "Invalid username or password" }
```

---

### GET /auth/profile

Get the authenticated user's profile.

**Headers:** `Authorization: Bearer <token>`

**200 OK:**
```json
{
  "success": true,
  "data": { "id": "uuid", "username": "alice", "role": "user", "created_at": "...", "has_recovery_key": true }
}
```

---

### PATCH /auth/password

Update the authenticated user's own password.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{ "current_password": "securepass123", "new_password": "newStrongPass456" }
```

**200 OK:**
```json
{ "success": true, "message": "Password updated successfully", "data": null }
```

**401 Unauthorized:**
```json
{ "success": false, "error": "Current password is incorrect" }
```

---

### DELETE /auth/account

Delete the authenticated user's own account.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{ "password": "securepass123" }
```

**200 OK:**
```json
{ "success": true, "message": "Account deleted successfully", "data": null }
```

---

### POST /auth/forgot-password

Reset password using a recovery key. **Public endpoint** — no JWT required, but strictly rate-limited (5 requests per 15 minutes per IP).

On success, the old recovery key is invalidated and a **new recovery key** is returned.

**Request:**
```json
{
  "username": "alice",
  "recovery_key": "RC-a7f2-k9m3-x4p8-n2d6",
  "new_password": "myNewSecurePass456"
}
```

**200 OK:**
```json
{
  "success": true,
  "message": "Password has been reset successfully. Please save your new recovery key — it will not be shown again.",
  "data": {
    "new_recovery_key": "RC-m3x8-p2d7-k9a4-f6n1"
  }
}
```

> ⚠️ **The recovery key is rotated on every successful reset.** The old key becomes invalid immediately. Save the new one.

**401 Unauthorized:**
```json
{ "success": false, "error": "Invalid username or recovery key" }
```

**429 Too Many Requests:**
```json
{ "success": false, "error": "Too many password reset attempts. Please try again in 15 minutes." }
```

---

### POST /auth/recovery-key/generate

Generate a recovery key for the first time — for existing users who registered before this feature was added. Requires password confirmation.

If the user already has a recovery key, returns `409 Conflict` — use the regenerate endpoint instead.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{ "password": "securepass123" }
```

**201 Created:**
```json
{
  "success": true,
  "message": "Recovery key generated successfully. Please save it — it will not be shown again.",
  "data": {
    "recovery_key": "RC-a7f2-k9m3-x4p8-n2d6"
  }
}
```

**409 Conflict (already has key):**
```json
{ "success": false, "error": "Recovery key already exists. Use the regenerate endpoint to get a new one." }
```

---

### POST /auth/recovery-key/regenerate

Rotate (regenerate) the recovery key. Invalidates the previous key and returns a new one. Requires password confirmation.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{ "password": "securepass123" }
```

**200 OK:**
```json
{
  "success": true,
  "message": "Recovery key regenerated successfully. Please save the new key — the old one is now invalid.",
  "data": {
    "recovery_key": "RC-m3x8-p2d7-k9a4-f6n1"
  }
}
```

---

### GET /auth/admin/users

List all registered users (admin only).

**Headers:** `Authorization: Bearer <admin-token>`

**200 OK:**
```json
{
  "success": true,
  "data": [
    { "id": "...", "username": "admin", "role": "admin", "created_at": "..." }
  ]
}
```

---

### PATCH /auth/admin/users/:id/password

Force-reset any user's password (admin only).

**Headers:** `Authorization: Bearer <admin-token>`

**Request:**
```json
{ "new_password": "resetted123" }
```

**200 OK:**
```json
{ "success": true, "message": "Password for user <id> updated successfully", "data": null }
```

**404 Not Found:**
```json
{ "success": false, "error": "User not found" }
```

---

### DELETE /auth/admin/users/:id

Delete any user account (admin only). Admins cannot delete their own account via this endpoint.

**Headers:** `Authorization: Bearer <admin-token>`

**200 OK:**
```json
{
  "success": true,
  "message": "User deleted successfully",
  "data": { "deleted_user": { "id": "...", "username": "alice", "role": "user" } }
}
```

**403 Forbidden (deleting self):**
```json
{ "success": false, "error": "Admins cannot delete their own account via this endpoint" }
```

---

## Default Admin

| Field | Default |
|---|---|
| username | `admin` |
| password | `Admin@1234!` |
| role | `admin` |

> **Wajib ganti** `ADMIN_PASSWORD` di `.env` sebelum production. Seeder menggunakan `upsert` — aman dijalankan berkali-kali.

---

## JWT Payload

```json
{ "sub": "user-uuid", "username": "alice", "role": "user", "iat": 0000000000, "exp": 0000000000 }
```

---

## Example API Usage (curl)

```bash
BASE=http://localhost:3000

# Register user (save the recovery_key from response!)
curl -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"securepass123","role":"user"}'

# Login
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234!"}' \
  | jq -r '.data.token')

# Get profile
curl -H "Authorization: Bearer $TOKEN" $BASE/auth/profile

# Update password
curl -X PATCH $BASE/auth/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"Admin@1234!","new_password":"NewAdmin@5678!"}'

# Forgot password (using recovery key)
curl -X POST $BASE/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","recovery_key":"RC-a7f2-k9m3-x4p8-n2d6","new_password":"newPass123"}'

# Generate recovery key (for existing users without one)
curl -X POST $BASE/auth/recovery-key/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"Admin@1234!"}'

# Regenerate (rotate) recovery key
curl -X POST $BASE/auth/recovery-key/regenerate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"Admin@1234!"}'

# List all users (admin)
curl -H "Authorization: Bearer $TOKEN" $BASE/auth/admin/users

# Health check
curl $BASE/health
```

---

## 📊 Observability

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  auth-service :3000                        │
│                                                            │
│  /metrics  ──────────────────────────► Prometheus          │
│  stdout (JSON logs) ─────► Alloy ───► Loki                │
│  OTLP traces (gRPC) ─────► Alloy ───► Tempo               │
└──────────────────────────────────────────────────────────┘
                                             │
                                             ▼
                                         Grafana :8000
                              (metrics + logs + traces correlated)
```

### Signal Pipeline

| Signal | Produced by | Collector | Storage |
|---|---|---|---|
| **Metrics** | `prom-client` → `/metrics` | Prometheus scrape | Prometheus TSDB |
| **Logs** | `Winston` JSON → stdout | Alloy Docker scrape | Loki |
| **Traces** | `OpenTelemetry` → OTLP/gRPC | Alloy OTLP receiver | Tempo |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency distribution |
| `http_requests_in_flight` | Gauge | `method`, `route` | Active in-flight requests |
| `auth_operations_total` | Counter | `operation`, `status` | Auth business operations |

---

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start with hot reload |
| `bun run start` | Start production |
| `bun run seed` | Seed default admin |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:push` | Sync schema to DB |
| `bun run db:migrate` | Create + run migrations (dev) |
| `bun run db:migrate:prod` | Run existing migrations (prod) |
| `bun run db:studio` | Open Prisma Studio GUI |
| `bun run db:reset` | Reset database (dev only) |

---

## Security Notes

- Passwords hashed with bcrypt (12 salt rounds)
- **Recovery keys** hashed with bcrypt — never stored in plain text
- Recovery keys shown only once (at registration or after reset/regeneration)
- Recovery keys rotated on every successful forgot-password usage
- JWT secret from environment — never hardcoded
- Generic login/forgot-password error messages — prevents username enumeration
- `password_hash` and `recovery_key_hash` never returned in any API response
- **Rate limiting** on public auth endpoints (register, login: 20/15min; forgot-password: 5/15min)
- `x-powered-by` header disabled
- All input validated with Zod before touching DB
- Prisma ORM prevents SQL injection by design
- Users can only modify/delete their own accounts
- Admins protected from deleting their own account
- Non-root container user (UID 1001) in Docker
- Recovery key uses ambiguity-free charset (no 0/O, 1/l/I confusion)