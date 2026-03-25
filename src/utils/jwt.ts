// src/utils/jwt.ts
// JWT signing and verification helpers.

import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  sub: string;       // user id
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Signs a JWT access token with the user's id, username, and role.
 */
export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verifies a JWT token and returns the decoded payload.
 * Throws JsonWebTokenError or TokenExpiredError on failure.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
