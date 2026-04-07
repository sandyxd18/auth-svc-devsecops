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

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/health` | — | — | Health check |
| GET | `/metrics` | — | — | Prometheus metrics scrape |
| POST | `/auth/register` | — | — | Register new user |
| POST | `/auth/login` | — | — | Login, get JWT |
| GET | `/auth/profile` | ✅ JWT | any | Get own profile |
| PATCH | `/auth/password` | ✅ JWT | any | Update own password |
| DELETE | `/auth/account` | ✅ JWT | any | Delete own account |
| GET | `/auth/admin-only` | ✅ JWT | admin | Admin ping |
| GET | `/auth/admin/users` | ✅ JWT | admin | List all users |
| PATCH | `/auth/admin/users/:id/password` | ✅ JWT | admin | Force-reset user password |
| DELETE | `/auth/admin/users/:id` | ✅ JWT | admin | Delete any user |

---

### POST /auth/register

Register a new user account.

**Request:**
```json
{ "username": "alice", "password": "securepass123", "role": "user" }
```

**201 Created:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": { "id": "uuid", "username": "alice", "role": "user", "created_at": "..." }
}
```

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
    "user": { "id": "uuid", "username": "alice", "role": "user" }
  }
}
```

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
  "data": { "id": "uuid", "username": "alice", "role": "user", "created_at": "..." }
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

# Register user
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
- JWT secret from environment — never hardcoded
- Generic login error messages — prevents username enumeration
- `password_hash` never returned in any API response
- `x-powered-by` header disabled
- All input validated with Zod before touching DB
- Prisma ORM prevents SQL injection by design
- Users can only modify/delete their own accounts
- Admins protected from deleting their own account
- Non-root container user (UID 1001) in Docker