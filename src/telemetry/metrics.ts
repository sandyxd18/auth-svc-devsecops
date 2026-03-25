// src/telemetry/metrics.ts
// Prometheus metrics registry using prom-client.
// Exposes /metrics endpoint — scraped by Prometheus directly.
//
// Metrics defined here:
//   http_requests_total          — counter, labelled by method/route/status
//   http_request_duration_seconds — histogram, request latency distribution
//   http_requests_in_flight      — gauge, currently active requests
//   auth_operations_total        — counter, labelled by operation/status

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";
import { env } from "../config/env";

// Use a dedicated registry (not the global one) for clean isolation
export const register = new Registry();

// Attach default Node.js/process metrics (memory, CPU, event loop lag, etc.)
collectDefaultMetrics({
  register,
  labels: {
    service: env.SERVICE_NAME,
    version: env.SERVICE_VERSION,
  },
});

// ── HTTP Metrics ──────────────────────────────────────────────────────────────

/** Total HTTP requests, broken down by method, normalized route, and status code */
export const httpRequestsTotal = new Counter({
  name:    "http_requests_total",
  help:    "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

/** Request duration histogram — used for p50/p95/p99 latency in Grafana */
export const httpRequestDurationSeconds = new Histogram({
  name:    "http_request_duration_seconds",
  help:    "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/** Currently in-flight requests */
export const httpRequestsInFlight = new Gauge({
  name:    "http_requests_in_flight",
  help:    "Number of HTTP requests currently being processed",
  labelNames: ["method", "route"],
  registers: [register],
});

// ── Auth Business Metrics ─────────────────────────────────────────────────────

/** Auth-specific operations counter — track success/failure per operation */
export const authOperationsTotal = new Counter({
  name:    "auth_operations_total",
  help:    "Total number of auth operations",
  labelNames: ["operation", "status"], // operation: register|login|..., status: success|failure
  registers: [register],
});
