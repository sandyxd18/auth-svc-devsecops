// src/telemetry/tracer.ts
// OpenTelemetry SDK initialisation.
// MUST be imported FIRST in server.ts — before any other imports —
// so that auto-instrumentation can patch Express, Prisma, HTTP, etc.
//
// Trace pipeline:
//   auth-service → OTLP/gRPC (port 4317) → Alloy → Tempo → Grafana

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

// Read config before env module does its full validation — tracer must init first
const SERVICE_NAME    = process.env.SERVICE_NAME    ?? "auth-microservice";
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? "1.0.0";
const OTLP_ENDPOINT   = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://alloy:4317";

const traceExporter = new OTLPTraceExporter({
  url: `${OTLP_ENDPOINT}/v1/traces`,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]:    SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  }),

  traceExporter,

  // Auto-instrument: Express routes, HTTP calls, DNS, pg/Prisma DB queries
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy fs instrumentation
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();
console.log(`[Tracer] OpenTelemetry SDK started → ${OTLP_ENDPOINT}`);

// Flush spans on graceful shutdown
process.on("SIGTERM", () => sdk.shutdown().catch(console.error));
process.on("SIGINT",  () => sdk.shutdown().catch(console.error));

export default sdk;
