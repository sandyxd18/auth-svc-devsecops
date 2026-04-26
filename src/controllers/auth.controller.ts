// src/controllers/auth.controller.ts
// HTTP layer — parse/validate request, call service, send response.
// No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import {
  AuthService,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
} from "../services/auth.service";
import {
  registerSchema,
  loginSchema,
  updatePasswordSchema,
  adminUpdatePasswordSchema,
  forgotPasswordSchema,
  regenerateRecoveryKeySchema,
  generateRecoveryKeySchema,
} from "../utils/validators";
import { sendSuccess, sendError } from "../utils/response";

export const AuthController = {

  // ── Public ──────────────────────────────────────────────────────────────────

  /** POST /auth/register */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) { sendError(res, "Validation failed", 400, parsed.error.flatten()); return; }

      const result = await AuthService.register(parsed.data);
      sendSuccess(res, result, "User registered successfully. Please save your recovery key — it will not be shown again.", 201);
    } catch (err) {
      if (err instanceof ConflictError) sendError(res, err.message, 409);
      else next(err);
    }
  },

  /** GET /auth/check-username */
  async checkUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = req.query;
      if (!username || typeof username !== 'string') {
        sendError(res, "Username query parameter is required", 400);
        return;
      }
      
      const result = await AuthService.checkUsername(username as string);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  /** POST /auth/login */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) { sendError(res, "Validation failed", 400, parsed.error.flatten()); return; }

      const result = await AuthService.login(parsed.data);

      const isProduction = process.env.NODE_ENV === "production";
      const cookieOptions = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: isProduction,
        maxAge: 60 * 60 * 1000, // 1 hour
        path: "/",
      };

      // Use separate cookie names to isolate admin and user sessions.
      // admin_auth_token  → only read by dashboard (/auth/admin/me)
      // user_auth_token   → only read by frontend  (/auth/me)
      if (result.user.role === "admin") {
        res.cookie("admin_auth_token", result.token, cookieOptions);
      } else {
        res.cookie("user_auth_token", result.token, cookieOptions);
      }

      sendSuccess(res, {
        user: result.user,
        token: result.token,
        has_recovery_key: result.has_recovery_key,
      }, "Login successful");
    } catch (err) {
      if (err instanceof UnauthorizedError) sendError(res, err.message, 401);
      else next(err);
    }
  },

  /**
   * GET /auth/me
   * Session restore for REGULAR USERS (frontend).
   * Reads the user_auth_token cookie. Rejects if no user cookie exists,
   * even if an admin_auth_token cookie is present — keeps sessions isolated.
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.getProfile(req.user!.sub);
      const { signToken } = await import("../utils/jwt");
      const token = signToken({ sub: req.user!.sub, username: req.user!.username, role: req.user!.role });
      sendSuccess(res, { ...user, token });
    } catch (err) {
      if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },

  /**
   * GET /auth/admin/me
   * Session restore for ADMINS (dashboard).
   * Reads the admin_auth_token cookie. Rejects if not admin role.
   */
  async adminMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user!.role !== "admin") {
        sendError(res, "Access denied", 403);
        return;
      }
      const user = await AuthService.getProfile(req.user!.sub);
      const { signToken } = await import("../utils/jwt");
      const token = signToken({ sub: req.user!.sub, username: req.user!.username, role: req.user!.role });
      sendSuccess(res, { ...user, token });
    } catch (err) {
      if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },

  /**
   * POST /auth/logout
   * Clears the role-appropriate cookie.
   * Accepts optional query param ?role=admin to clear admin_auth_token.
   */
  logout(req: Request, res: Response): void {
    const isAdmin = req.query.role === "admin";
    const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/" };
    if (isAdmin) {
      res.clearCookie("admin_auth_token", cookieOptions);
    } else {
      res.clearCookie("user_auth_token", cookieOptions);
    }
    sendSuccess(res, null, "Logged out successfully");
  },

  /** POST /auth/forgot-password */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) { sendError(res, "Validation failed", 400, parsed.error.flatten()); return; }

      const result = await AuthService.forgotPassword(parsed.data);
      sendSuccess(res, result, "Password has been reset successfully. Please save your new recovery key — it will not be shown again.");
    } catch (err) {
      if (err instanceof UnauthorizedError) sendError(res, err.message, 401);
      else next(err);
    }
  },

  // ── User (self) ─────────────────────────────────────────────────────────────

  /** GET /auth/profile */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.getProfile(req.user!.sub);
      sendSuccess(res, user);
    } catch (err) {
      if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },

  /**
   * PATCH /auth/password
   * User updating their own password — requires current_password + new_password.
   */
  async updatePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = updatePasswordSchema.safeParse(req.body);
      if (!parsed.success) { sendError(res, "Validation failed", 400, parsed.error.flatten()); return; }

      await AuthService.updatePassword(req.user!.sub, parsed.data);
      sendSuccess(res, null, "Password updated successfully");
    } catch (err) {
      if (err instanceof UnauthorizedError) sendError(res, err.message, 401);
      else if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },

  /**
   * DELETE /auth/account
   * User deleting their own account — requires password confirmation.
   */
  async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { password } = req.body;
      if (!password || typeof password !== "string") {
        sendError(res, "Password confirmation is required", 400);
        return;
      }

      await AuthService.deleteUser(req.user!.sub, password);
      sendSuccess(res, null, "Account deleted successfully");
    } catch (err) {
      if (err instanceof UnauthorizedError) sendError(res, err.message, 401);
      else if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },

  /**
   * POST /auth/recovery-key/generate
   * Generate first recovery key for existing users who don't have one.
   * Requires password confirmation.
   */
  async generateRecoveryKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = generateRecoveryKeySchema.safeParse(req.body);
      if (!parsed.success) { sendError(res, "Validation failed", 400, parsed.error.flatten()); return; }

      const result = await AuthService.generateRecoveryKey(req.user!.sub, parsed.data.password);
      sendSuccess(res, result, "Recovery key generated successfully. Please save it — it will not be shown again.", 201);
    } catch (err) {
      if (err instanceof UnauthorizedError) sendError(res, err.message, 401);
      else if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else if (err instanceof ConflictError) sendError(res, err.message, 409);
      else next(err);
    }
  },

  /**
   * POST /auth/recovery-key/regenerate
   * Regenerate (rotate) recovery key for authenticated users.
   * Invalidates the previous key. Requires password confirmation.
   */
  async regenerateRecoveryKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = regenerateRecoveryKeySchema.safeParse(req.body);
      if (!parsed.success) { sendError(res, "Validation failed", 400, parsed.error.flatten()); return; }

      const result = await AuthService.regenerateRecoveryKey(req.user!.sub, parsed.data.password);
      sendSuccess(res, result, "Recovery key regenerated successfully. Please save the new key — the old one is now invalid.");
    } catch (err) {
      if (err instanceof UnauthorizedError) sendError(res, err.message, 401);
      else if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },

  // ── Admin ───────────────────────────────────────────────────────────────────

  /** GET /auth/admin-only */
  adminOnly(_req: Request, res: Response): void {
    sendSuccess(res, { message: "Hello Admin" });
  },

  /**
   * GET /admin/users
   * Admin: list all users.
   */
  async listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await AuthService.listUsers();
      sendSuccess(res, users);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /admin/users/:id/password
   * Admin: update any user's password without knowing the current one.
   */
  async adminUpdatePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = adminUpdatePasswordSchema.safeParse(req.body);
      if (!parsed.success) { sendError(res, "Validation failed", 400, parsed.error.flatten()); return; }

      await AuthService.adminUpdatePassword(req.params.id, parsed.data);
      sendSuccess(res, null, `Password for user ${req.params.id} updated successfully`);
    } catch (err) {
      if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },

  /**
   * DELETE /admin/users/:id
   * Admin: delete any user by ID (cannot delete self).
   */
  async adminDeleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.adminDeleteUser(req.user!.sub, req.params.id);
      sendSuccess(res, result, "User deleted successfully");
    } catch (err) {
      if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else if (err instanceof ForbiddenError) sendError(res, err.message, 403);
      else next(err);
    }
  },
};