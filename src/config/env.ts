// src/config/env.ts
// Centralized environment variable validation and access.
// Fails fast at startup if required variables are missing.

const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`[Config] FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export const env = {
  // Core
  DATABASE_URL:   process.env.DATABASE_URL as string,
  JWT_SECRET:     process.env.JWT_SECRET as string,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "1h",
  PORT:           parseInt(process.env.PORT ?? "3000", 10),
  NODE_ENV:       process.env.NODE_ENV ?? "development",
  IS_PRODUCTION:  process.env.NODE_ENV === "production",

  // Observability
  SERVICE_NAME:    process.env.SERVICE_NAME ?? "auth-microservice",
  SERVICE_VERSION: process.env.SERVICE_VERSION ?? "1.0.0",

  // OpenTelemetry — OTLP endpoint (Alloy receives traces & forwards to Tempo)
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://alloy:4317",

  // Loki — Alloy scrapes logs via file/stdout; or push directly if needed
  LOKI_HOST: process.env.LOKI_HOST ?? "http://loki:3100",
};
