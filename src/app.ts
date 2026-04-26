// src/app.ts
// Express application factory.

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { register } from "./telemetry/metrics";

// Allowed origins: frontend (port 80) and dashboard (port 8081)
const ALLOWED_ORIGINS = [
  "http://localhost",
  "http://localhost:80",
  "http://localhost:8081",
  // Dev fallback (vite dev servers)
  "http://localhost:5173",
  "http://localhost:5174",
];

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  // ── CORS — must be before routes, allow credentials for HttpOnly cookie ──────
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, same-origin server calls)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,          // Required for cookies to be sent/received
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  app.use(cookieParser());
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: false }));

  // ── Observability: request logging + Prometheus counters/histograms ─────────
  app.use(requestLogger);

  // ── Health Check ─────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Prometheus Metrics Endpoint ───────────────────────────────────────────────
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