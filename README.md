# 🔐 Auth Microservice

Production-ready JWT authentication microservice built with **Bun**, **Express**, **PostgreSQL**, and **Prisma** — fully instrumented with metrics, logs, and distributed tracing via the Grafana observability stack.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Framework | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT (jsonwebtoken) |
| Password Hashing | bcryptjs (12 rounds) |
| Validation | Zod |
| Metrics | prom-client (Prometheus) |
| Logs | Winston → Alloy → Loki |
| Traces | OpenTelemetry → Alloy → Tempo |
| Visualization | Grafana |

---

## Project Structure

```
auth-service/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── controllers/
│   │   └── auth.controller.ts
│   ├── db/
│   │   ├── prisma.ts
│   │   └── seed.ts
│   ├── middleware/
│   │   ├── auth.ts               # authenticateJWT + authorizeRole
│   │   ├── errorHandler.ts       # Structured error logging
│   │   └── requestLogger.ts      # HTTP log + Prometheus metrics per request
│   ├── routes/
│   │   └── auth.routes.ts
│   ├── services/
│   │   └── auth.service.ts       # Business logic + auth metrics emission
│   ├── telemetry/
│   │   ├── logger.ts             # Winston JSON logger (injects trace_id/span_id)
│   │   ├── metrics.ts            # prom-client registry + metric definitions
│   │   └── tracer.ts             # OpenTelemetry SDK init (MUST load first)
│   ├── utils/
│   │   ├── jwt.ts
│   │   ├── response.ts
│   │   └── validators.ts
│   ├── app.ts                    # Express factory + /metrics endpoint
│   └── server.ts                 # Entry point (tracer imported first)
├── .dockerignore
├── .env.example
├── docker-compose.yml            # App + full observability stack
├── Dockerfile
├── entrypoint.sh
├── package.json
└── README.md
```

---

## Observability Architecture

```
┌─────────────────────────────────────────────────────┐
│                  auth-service :3000                  │
│                                                      │
│  /metrics  ──────────────────────────► Prometheus   │
│  stdout (JSON logs) ─────► Alloy ───► Loki          │
│  OTLP traces (gRPC) ─────► Alloy ───► Tempo         │
└─────────────────────────────────────────────────────┘
                                             │
                                             ▼
                                         Grafana :3001
                                    (metrics + logs + traces
                                     all correlated by trace_id)
```

### Signal Pipeline

| Signal | Produced by | Collector | Storage | Port |
|---|---|---|---|---|
| **Metrics** | `prom-client` → `/metrics` | Prometheus scrape | Prometheus TSDB | 9090 |
| **Logs** | `Winston` → stdout (JSON) | Alloy Docker log scrape | Loki | 3100 |
| **Traces** | `OpenTelemetry` → OTLP/gRPC | Alloy OTLP receiver | Tempo | 3200 |

### Correlation

Every log entry emitted by Winston **automatically includes** the active OpenTelemetry `trace_id` and `span_id`. This enables one-click navigation in Grafana:

- **Log → Trace:** click `trace_id` in a Loki log line → jumps to the Tempo trace
- **Trace → Log:** from a Tempo span → filters Loki for matching `trace_id`
- **Metric → Trace:** Prometheus exemplars carry `trace_id` → link to Tempo

---

## Getting Started (Local without Docker)

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL >= 14

### 1. Clone & Install

```bash
git clone https://github.com/sandyxd18/auth-svc-devsecops.git
cd auth-svc-devsecops
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

# Observability (point to local instances if running)
SERVICE_NAME="auth-microservice"
SERVICE_VERSION="1.0.0"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
LOKI_HOST="http://localhost:3100"
```

### 3. Set Up Database & Seed

```bash
bun run db:generate
bun run db:push
bun run seed
```

### 4. Start the Server

```bash
bun run dev     # hot reload
bun run start   # production
```

---

### Service URLs setelah stack berjalan

| Service | URL | Credentials |
|---|---|---|
| **Auth API** | http://localhost:3000 | — |
| **Grafana** | http://localhost:3001 | admin / admin |
| **Prometheus** | http://localhost:9090 | — |
| **Alloy UI** | http://localhost:12345 | — |
| **Loki** | http://localhost:3100 | — |
| **Tempo** | http://localhost:3200 | — |

### Boot Sequence

```
[entrypoint] Syncing database schema...
🚀  Your database is now in sync with your Prisma schema.
[entrypoint] Running seeder...
[Seed] Default admin user ready: admin (admin)
[entrypoint] Starting server...
[Tracer] OpenTelemetry SDK started → http://alloy:4317
[DB] Connected to PostgreSQL via Prisma ✓
[Server] Auth microservice started — port 3000
```

---

## Grafana — Using the Dashboards

### 1. Pre-built Dashboard

Grafana auto-provisions the **"Auth Microservice — Overview"** dashboard on startup. Navigate to:

`Grafana → Dashboards → Auth Microservice → Auth Microservice — Overview`

Panels included:
- Request rate (req/s)
- Error rate (5xx %)
- Latency percentiles (p50 / p95 / p99)
- In-flight requests
- Request rate per route
- Auth operations (register / login / delete) by status
- HTTP status code breakdown
- Live log stream from Loki

### 2. Explore — Logs (Loki)

```
Grafana → Explore → datasource: Loki
Query: {service_name="auth_service"}
```

Filter by level:
```
{service_name="auth_service"} | json | level="error"
```

Filter by trace_id (correlation):
```
{service_name="auth_service"} | json | trace_id="<paste-trace-id>"
```

### 3. Explore — Traces (Tempo)

```
Grafana → Explore → datasource: Tempo
Search: Service Name = auth-microservice
```

From any trace span you can click **"Logs for this span"** to jump directly to the correlated Loki logs.

### 4. Explore — Metrics (Prometheus)

Useful queries:

```promql
# Request rate
rate(http_requests_total{service="auth-microservice"}[1m])

# p95 latency in ms
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) * 1000

# Login success vs failure
rate(auth_operations_total{operation="login"}[5m])

# Error rate %
100 * sum(rate(http_requests_total{status_code=~"5.."}[1m])) / sum(rate(http_requests_total[1m]))
```

---

## Prometheus Metrics Reference

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency distribution |
| `http_requests_in_flight` | Gauge | `method`, `route` | Active in-flight requests |
| `auth_operations_total` | Counter | `operation`, `status` | Auth business operations |
| `process_cpu_seconds_total` | Counter | — | Node.js process CPU (default) |
| `process_resident_memory_bytes` | Gauge | — | Memory usage (default) |
| `nodejs_eventloop_lag_seconds` | Gauge | — | Event loop lag (default) |

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

```json
// Request
{ "username": "alice", "password": "securepass123", "role": "user" }

// 201 Created
{ "success": true, "message": "User registered successfully",
  "data": { "id": "uuid", "username": "alice", "role": "user", "created_at": "..." } }

// 409 Conflict
{ "success": false, "error": "Username already taken" }
```

---

### POST /auth/login

```json
// Request
{ "username": "alice", "password": "securepass123" }

// 200 OK
{ "success": true, "message": "Login successful",
  "data": { "token": "eyJ...", "user": { "id": "uuid", "username": "alice", "role": "user" } } }

// 401 Unauthorized
{ "success": false, "error": "Invalid username or password" }
```

---

### GET /auth/profile

```
Authorization: Bearer <token>

// 200 OK
{ "success": true, "data": { "id": "uuid", "username": "alice", "role": "user", "created_at": "..." } }
```

---

### PATCH /auth/password

```json
// Request  (Authorization: Bearer <token>)
{ "current_password": "securepass123", "new_password": "newStrongPass456" }

// 200 OK
{ "success": true, "message": "Password updated successfully", "data": null }

// 401 Unauthorized
{ "success": false, "error": "Current password is incorrect" }
```

---

### DELETE /auth/account

```json
// Request  (Authorization: Bearer <token>)
{ "password": "securepass123" }

// 200 OK
{ "success": true, "message": "Account deleted successfully", "data": null }
```

---

### GET /auth/admin/users

```
Authorization: Bearer <admin-token>

// 200 OK
{ "success": true, "data": [ { "id": "...", "username": "admin", "role": "admin", "created_at": "..." }, ... ] }
```

---

### PATCH /auth/admin/users/:id/password

```json
// Request  (Authorization: Bearer <admin-token>)
{ "new_password": "resetted123" }

// 200 OK
{ "success": true, "message": "Password for user <id> updated successfully", "data": null }

// 404 Not Found
{ "success": false, "error": "User not found" }
```

---

### DELETE /auth/admin/users/:id

```
Authorization: Bearer <admin-token>

// 200 OK
{ "success": true, "message": "User deleted successfully",
  "data": { "deleted_user": { "id": "...", "username": "alice", "role": "user" } } }

// 403 Forbidden (deleting self)
{ "success": false, "error": "Admins cannot delete their own account via this endpoint" }
```

---

## Default Admin

| Field | Default |
|---|---|
| username | `admin` |
| password | `Admin@1234!` |
| role | `admin` |

> **Wajib ganti** `ADMIN_PASSWORD` di `.env` sebelum production.

Seeder menggunakan `upsert` — aman dijalankan berkali-kali.

---

## JWT Payload

```json
{ "sub": "user-uuid", "username": "alice", "role": "user", "iat": 0000000000, "exp": 0000000000 }
```

---

## Security Notes

- Passwords hashed dengan bcrypt (12 salt rounds)
- JWT secret dari environment — tidak pernah hardcoded
- Pesan error login generik — mencegah username enumeration
- `password_hash` tidak pernah dikembalikan di response manapun
- Header `x-powered-by` dinonaktifkan
- Semua input divalidasi Zod sebelum menyentuh DB
- Prisma ORM mencegah SQL injection by design
- User hanya bisa mengubah/menghapus akun sendiri
- Admin dilindungi dari menghapus akun sendiri

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