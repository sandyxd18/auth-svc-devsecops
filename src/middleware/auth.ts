// src/middleware/auth.ts
// JWT authentication and role-based authorization middleware.
// Reads token from role-specific HttpOnly cookies or Authorization Bearer header.
//
// Cookie isolation:
//   admin_auth_token  — set on admin login, read by /auth/admin/me (dashboard)
//   user_auth_token   — set on user login,  read by /auth/me (frontend)
//
// The separation ensures that an admin session on the dashboard does NOT
// automatically create a logged-in session on the user-facing storefront.

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
 * General-purpose middleware: accepts any valid cookie or Bearer token.
 * Priority: admin_auth_token > user_auth_token > Authorization header.
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Priority: Bearer header (explicit, always correct) → user cookie → admin cookie
  let token: string | undefined;

  // 1. Authorization Bearer header (highest priority — set by in-memory store)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // 2. Cookie fallback (for routes that don't inject Bearer)
  if (!token) {
    token = req.cookies?.user_auth_token || req.cookies?.admin_auth_token;
  }

  if (!token) {
    sendError(res, "Authentication required", 401);
    return;
  }

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
 * authenticateAdminCookie
 * Strict middleware for dashboard session restore.
 * Only accepts the admin_auth_token cookie — ignores user cookies.
 * Rejects requests that only have a user_auth_token cookie.
 */
export function authenticateAdminCookie(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token: string | undefined = req.cookies?.admin_auth_token;

  if (!token) {
    sendError(res, "Admin session not found", 401);
    return;
  }

  try {
    const payload = verifyToken(token);
    if (payload.role !== "admin") {
      sendError(res, "Access denied: admin role required", 403);
      return;
    }
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
 * authenticateUserCookie
 * Strict middleware for frontend session restore.
 * Only accepts the user_auth_token cookie — ignores admin cookies.
 * Ensures admin sessions don't bleed into the storefront.
 */
export function authenticateUserCookie(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token: string | undefined = req.cookies?.user_auth_token;

  if (!token) {
    sendError(res, "User session not found", 401);
    return;
  }

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
