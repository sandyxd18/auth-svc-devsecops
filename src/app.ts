// src/app.ts
// Express application factory.

import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { register } from "./telemetry/metrics";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: false }));

  // ── Observability: request logging + Prometheus counters/histograms ─────────
  app.use(requestLogger);

  // ── Health Check ─────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Prometheus Metrics Endpoint ───────────────────────────────────────────────
  // Scraped by Prometheus every 15s (configured in prometheus.yml)
  app.get("/metrics", async (_req, res) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch {
      res.status(500).end();
    }
  });

  // ── Application Routes ────────────────────────────────────────────────────────
  app.use("/auth", authRoutes);

  // ── Error Handlers (must be last) ─────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}