// src/routes/auth.routes.ts
// Route definitions for all auth endpoints.

import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticateJWT, authenticateAdminCookie, authenticateUserCookie, authorizeRole } from "../middleware/auth";
import { createRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Sensitive endpoints get stricter rate limits to prevent brute force attacks.

const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,  // 15-minute window
  maxRequests: 5,             // max 5 attempts per 15 min per IP
  keyPrefix: "rl:forgot",
  message: "Too many password reset attempts. Please try again in 15 minutes.",
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,  // 15-minute window
  maxRequests: 20,            // max 20 attempts per 15 min per IP
  keyPrefix: "rl:auth",
  message: "Too many authentication attempts. Please try again later.",
});

// ── Public ────────────────────────────────────────────────────────────────────

router.post("/register", authLimiter, AuthController.register);
router.get("/check-username", authLimiter, AuthController.checkUsername);
router.post("/login",    authLimiter, AuthController.login);

// Session restore — strict cookie isolation:
// /auth/me         → frontend (user_auth_token only)
// /auth/admin/me   → dashboard (admin_auth_token only)
router.get("/me",       authenticateUserCookie,  AuthController.me);
router.get("/admin/me", authenticateAdminCookie, AuthController.adminMe);

// Logout — clears the role-appropriate cookie (?role=admin for dashboard)
router.post("/logout", AuthController.logout);

router.post("/forgot-password", forgotPasswordLimiter, AuthController.forgotPassword);

// ── User — self-service (any authenticated user) ──────────────────────────────

router.get   ("/profile",  authenticateJWT, AuthController.getProfile);
router.patch ("/password", authenticateJWT, AuthController.updatePassword);
router.delete("/account",  authenticateJWT, AuthController.deleteAccount);

// Recovery key management (authenticated users only)
router.post("/recovery-key/generate",    authenticateJWT, AuthController.generateRecoveryKey);
router.post("/recovery-key/regenerate",  authenticateJWT, AuthController.regenerateRecoveryKey);

// ── Admin-only ─────────────────────────────────────────────────────────────────

router.get("/admin-only", authenticateJWT, authorizeRole("admin"), AuthController.adminOnly);

// List all users
router.get("/admin/users", authenticateJWT, authorizeRole("admin"), AuthController.listUsers);

// Update any user's password
router.patch("/admin/users/:id/password", authenticateJWT, authorizeRole("admin"), AuthController.adminUpdatePassword);

// Delete any user
router.delete("/admin/users/:id", authenticateJWT, authorizeRole("admin"), AuthController.adminDeleteUser);

export default router;