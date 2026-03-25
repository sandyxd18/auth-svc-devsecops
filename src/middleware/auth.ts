// src/middleware/auth.ts
// JWT authentication and role-based authorization middleware.

import type { Request, Response, NextFunction } from "express";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { verifyToken, type JwtPayload } from "../utils/jwt";
import { sendError } from "../utils/response";

// Extend Express Request to carry the decoded JWT payload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * authenticateJWT
 * Extracts the Bearer token from the Authorization header,
 * verifies it, and attaches the decoded payload to req.user.
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendError(res, "Authorization header missing or malformed", 401);
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      sendError(res, "Token has expired", 401);
    } else if (err instanceof JsonWebTokenError) {
      sendError(res, "Invalid token", 401);
    } else {
      sendError(res, "Authentication failed", 401);
    }
  }
}

/**
 * authorizeRole
 * Factory that returns middleware allowing only users whose role
 * is included in the provided list.
 *
 * Usage: router.get("/admin-only", authenticateJWT, authorizeRole("admin"), handler)
 */
export function authorizeRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Not authenticated", 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(
        res,
        `Access denied. Required role(s): ${roles.join(", ")}`,
        403
      );
      return;
    }

    next();
  };
}
