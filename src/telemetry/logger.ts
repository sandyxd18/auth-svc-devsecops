// src/telemetry/logger.ts
// Structured JSON logger using Winston.
// In production: logs are written as JSON to stdout so Alloy can scrape
// and forward them to Loki. Each log line includes trace_id and span_id
// when inside an active OpenTelemetry span — enabling log-to-trace correlation
// directly in Grafana.

import { createLogger, format, transports } from "winston";
import { env } from "../config/env";
import { context, trace } from "@opentelemetry/api";

// Custom format that injects the active OTel trace/span IDs into every log entry.
// This is what enables "jump from log to trace" in Grafana.
const traceContextFormat = format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const ctx = span.spanContext();
    info["trace_id"] = ctx.traceId;
    info["span_id"]  = ctx.spanId;
  }
  return info;
});

const logger = createLogger({
  level: env.IS_PRODUCTION ? "info" : "debug",

  // All log entries are JSON objects — parseable by Alloy/Loki
  format: format.combine(
    format.timestamp({ format: "ISO" }),
    format.errors({ stack: true }),   // include stack traces on error objects
    traceContextFormat(),             // inject trace_id + span_id
    format.json()                     // final output: single-line JSON
  ),

  defaultMeta: {
    service:     env.SERVICE_NAME,
    version:     env.SERVICE_VERSION,
    environment: env.NODE_ENV,
  },

  transports: [
    // stdout — Alloy collects this via Docker log driver or file scrape
    new transports.Console(),
  ],
});

export default logger;
