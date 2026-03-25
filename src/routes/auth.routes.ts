// src/routes/auth.routes.ts
// Route definitions for all auth endpoints.

import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticateJWT, authorizeRole } from "../middleware/auth";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

router.post("/register", AuthController.register);
router.post("/login",    AuthController.login);

// ── User — self-service (any authenticated user) ──────────────────────────────

router.get   ("/profile",  authenticateJWT, AuthController.getProfile);
router.patch ("/password", authenticateJWT, AuthController.updatePassword);
router.delete("/account",  authenticateJWT, AuthController.deleteAccount);

// ── Admin-only ─────────────────────────────────────────────────────────────────

router.get("/admin-only", authenticateJWT, authorizeRole("admin"), AuthController.adminOnly);

// List all users
router.get("/admin/users", authenticateJWT, authorizeRole("admin"), AuthController.listUsers);

// Update any user's password
router.patch("/admin/users/:id/password", authenticateJWT, authorizeRole("admin"), AuthController.adminUpdatePassword);

// Delete any user
router.delete("/admin/users/:id", authenticateJWT, authorizeRole("admin"), AuthController.adminDeleteUser);

export default router;