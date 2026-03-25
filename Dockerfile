# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — deps
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# openssl required by Prisma engine on Alpine (musl libc + openssl 3.x)
RUN apk add --no-cache openssl

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — builder
# Generate Prisma client with correct binary target for Alpine
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY src    ./src
COPY package.json ./

# binaryTargets in schema.prisma must include "linux-musl-openssl-3.0.x"
RUN bunx prisma generate

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runner
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# openssl required at runtime by Prisma query engine
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser  --system --uid 1001 --ingroup appgroup appuser

# Copy runtime files
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/src         ./src
COPY --from=builder --chown=appuser:appgroup /app/prisma      ./prisma
COPY --chown=appuser:appgroup package.json ./

# Copy entrypoint script and make it executable (must be done as root, before USER)
COPY --chown=appuser:appgroup entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Use entrypoint script — handles migration + server start with proper error handling
ENTRYPOINT ["sh", "./entrypoint.sh"]