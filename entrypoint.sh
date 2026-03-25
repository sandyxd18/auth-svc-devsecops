#!/bin/sh
# entrypoint.sh
# Boot sequence:
#   1. Sync DB schema (prisma db push)
#   2. Seed default admin user
#   3. Start the server

set -e

echo "[entrypoint] Starting auth-service..."

# ── Step 1: Sync schema ───────────────────────────────────────────────────────
echo "[entrypoint] Syncing database schema..."

MAX_RETRIES=5
RETRY_DELAY=3
attempt=1

until bunx prisma db push --accept-data-loss; do
  if [ $attempt -ge $MAX_RETRIES ]; then
    echo "[entrypoint] ERROR: Schema push failed after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi
  echo "[entrypoint] Attempt $attempt failed. Retrying in ${RETRY_DELAY}s..."
  attempt=$((attempt + 1))
  sleep $RETRY_DELAY
done

echo "[entrypoint] Schema synced successfully."

# ── Step 2: Seed default admin ────────────────────────────────────────────────
echo "[entrypoint] Running seeder..."
bun src/db/seed.ts

# ── Step 3: Start server ──────────────────────────────────────────────────────
echo "[entrypoint] Starting server..."
exec bun src/server.ts