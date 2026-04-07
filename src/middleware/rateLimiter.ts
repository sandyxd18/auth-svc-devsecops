// src/middleware/rateLimiter.ts
// Simple in-memory rate limiter middleware.
// Limits requests per IP address within a sliding window.
// Suitable for single-instance deployments; for multi-instance, use Redis.

import type { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response";
import logger from "../telemetry/logger";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodically clean up expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000); // cleanup every 60 seconds

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum number of requests per window */
  maxRequests: number;
  /** Prefix for the store key (to separate different limiters) */
  keyPrefix?: string;
  /** Custom message returned when rate limited */
  message?: string;
}

/**
 * Creates a rate limiter middleware with the given options.
 *
 * Usage:
 *   app.use("/auth/forgot-password", createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 }));
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyPrefix = "rl",
    message = "Too many requests, please try again later",
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = store.get(key);

    // If no entry or window expired, start a new window
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      store.set(key, entry);
      setRateLimitHeaders(res, maxRequests, maxRequests - 1, entry.resetAt);
      next();
      return;
    }

    // Within window — increment counter
    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      setRateLimitHeaders(res, maxRequests, 0, entry.resetAt);
      res.set("Retry-After", String(retryAfterSec));

      logger.warn("rate_limit_exceeded", {
        ip,
        endpoint: req.originalUrl,
        count: entry.count,
        retry_after_seconds: retryAfterSec,
      });

      sendError(res, message, 429);
      return;
    }

    setRateLimitHeaders(res, maxRequests, maxRequests - entry.count, entry.resetAt);
    next();
  };
}

function setRateLimitHeaders(res: Response, limit: number, remaining: number, resetAt: number): void {
  res.set("X-RateLimit-Limit", String(limit));
  res.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}
