// src/middleware/errorHandler.ts
// Global Express error handler — catches any unhandled errors passed via next(err).

import type { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response";
import logger from "../telemetry/logger";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log with full stack trace — trace_id is auto-injected by logger.ts
  logger.error("unhandled_error", {
    error:   err.message,
    stack:   err.stack,
    method:  req.method,
    url:     req.originalUrl,
  });

  const message = process.env.NODE_ENV === "production"
    ? "Internal server error"
    : err.message;

  sendError(res, message, 500);
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route ${req.method} ${req.path} not found`, 404);
}
