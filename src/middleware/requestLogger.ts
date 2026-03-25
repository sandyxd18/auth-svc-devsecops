// src/middleware/requestLogger.ts
// HTTP request/response logging middleware.
// Each log entry is structured JSON and includes:
//   - trace_id / span_id (injected by logger.ts via active OTel span)
//   - method, url, status, duration_ms, user_id (if authenticated)
// This enables log ↔ trace correlation in Grafana Explore.

import type { Request, Response, NextFunction } from "express";
import logger from "../telemetry/logger";
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestsInFlight,
} from "../telemetry/metrics";

/**
 * Normalize Express route params to prevent high-cardinality labels.
 * e.g. /auth/admin/users/abc-123/password  →  /auth/admin/users/:id/password
 */
function normalizeRoute(req: Request): string {
  return req.route?.path
    ? `${req.baseUrl ?? ""}${req.route.path}`
    : req.path;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startAt = process.hrtime.bigint();
  const route   = normalizeRoute(req);

  // Track in-flight count
  httpRequestsInFlight.inc({ method: req.method, route });

  res.on("finish", () => {
    const durationMs  = Number(process.hrtime.bigint() - startAt) / 1_000_000;
    const durationSec = durationMs / 1000;
    const statusCode  = String(res.statusCode);
    const labels      = { method: req.method, route, status_code: statusCode };

    // Prometheus counters & histogram
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);
    httpRequestsInFlight.dec({ method: req.method, route });

    // Structured log — will be picked up by Alloy and forwarded to Loki
    logger.info("http_request", {
      method:      req.method,
      url:         req.originalUrl,
      route,
      status_code: res.statusCode,
      duration_ms: Math.round(durationMs),
      // Include user_id if JWT middleware has already attached req.user
      user_id:     (req as any).user?.sub ?? null,
      user_agent:  req.headers["user-agent"] ?? null,
    });
  });

  next();
}
