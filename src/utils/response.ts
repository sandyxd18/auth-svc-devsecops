// src/utils/response.ts
// Standardized API response helpers for consistent JSON shape.

import type { Response } from "express";

interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): void {
  const body: SuccessResponse<T> = { success: true, data };
  if (message) body.message = message;
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  error: string,
  statusCode = 500,
  details?: unknown
): void {
  const body: ErrorResponse = { success: false, error };
  if (details && process.env.NODE_ENV !== "production") {
    body.details = details;
  }
  res.status(statusCode).json(body);
}
