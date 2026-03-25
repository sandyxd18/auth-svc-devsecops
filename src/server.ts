// src/server.ts
// Entry point.
// IMPORTANT: tracer MUST be the very first import so OTel can patch
// Express, Prisma, and http before any of them are loaded.

import "./telemetry/tracer";
import "./config/env";
import { env } from "./config/env";
import { createApp } from "./app";
import prisma from "./db/prisma";
import logger from "./telemetry/logger";

const app = createApp();

async function startServer() {
  try {
    await prisma.$connect();
    logger.info("db_connected", { message: "Connected to PostgreSQL via Prisma" });

    app.listen(env.PORT, () => {
      logger.info("server_started", {
        message:   "Auth microservice started",
        port:      env.PORT,
        env:       env.NODE_ENV,
        metrics:   `http://localhost:${env.PORT}/metrics`,
        health:    `http://localhost:${env.PORT}/health`,
      });
    });
  } catch (err) {
    logger.error("server_start_failed", { error: (err as Error).message });
    await prisma.$disconnect();
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info("server_shutdown", { signal });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();