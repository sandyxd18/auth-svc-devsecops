// src/services/auth.service.ts
// Core business logic for authentication.
// Emits structured logs and Prometheus metrics for every operation.

import bcrypt from "bcryptjs";
import prisma from "../db/prisma";
import { signToken } from "../utils/jwt";
import { generateRecoveryKey, isValidRecoveryKeyFormat } from "../utils/recovery";
import logger from "../telemetry/logger";
import { authOperationsTotal } from "../telemetry/metrics";
import type {
  RegisterInput,
  LoginInput,
  UpdatePasswordInput,
  AdminUpdatePasswordInput,
  ForgotPasswordInput,
} from "../utils/validators";

const SALT_ROUNDS = 12;

// Helper to record auth metric + log in one call
function recordOp(operation: string, status: "success" | "failure", extra?: object) {
  authOperationsTotal.inc({ operation, status });
  const level = status === "success" ? "info" : "warn";
  logger[level](`auth_${operation}`, { operation, status, ...extra });
}

export const AuthService = {

  async register(input: RegisterInput) {
    const { username, password, role } = input;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      recordOp("register", "failure", { reason: "duplicate_username" });
      throw new ConflictError("Username already taken");
    }

    // Generate recovery key and hash it (like a password — stored hashed, shown once)
    const recoveryKey = generateRecoveryKey();
    const recovery_key_hash = await bcrypt.hash(recoveryKey, SALT_ROUNDS);

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { username, password_hash, role, recovery_key_hash },
      select: { id: true, username: true, role: true, created_at: true },
    });

    recordOp("register", "success", { user_id: user.id, role: user.role });

    // Return user data + plain recovery key (shown only once, never stored in plain text)
    return { ...user, recovery_key: recoveryKey };
  },

  async checkUsername(username: string) {
    if (!username) return { available: false };
    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return { available: !existing };
  },

  async login(input: LoginInput) {
    const { username, password } = input;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      recordOp("login", "failure", { reason: "user_not_found" });
      throw new UnauthorizedError("Invalid username or password");
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      recordOp("login", "failure", { reason: "wrong_password", user_id: user.id });
      throw new UnauthorizedError("Invalid username or password");
    }

    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    recordOp("login", "success", { user_id: user.id, role: user.role });

    return {
      token,
      user: { id: user.id, username: user.username, role: user.role },
      // Inform the client whether this user has a recovery key set up
      has_recovery_key: !!user.recovery_key_hash,
    };
  },

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, created_at: true, recovery_key_hash: true },
    });
    if (!user) throw new NotFoundError("User not found");

    // Don't expose the hash — just indicate whether a recovery key exists
    const { recovery_key_hash, ...profile } = user;
    return { ...profile, has_recovery_key: !!recovery_key_hash };
  },

  async updatePassword(userId: string, input: UpdatePasswordInput) {
    const { current_password, new_password } = input;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) {
      recordOp("update_password", "failure", { reason: "wrong_current_password", user_id: userId });
      throw new UnauthorizedError("Current password is incorrect");
    }

    await prisma.user.update({
      where: { id: userId },
      data:  { password_hash: await bcrypt.hash(new_password, SALT_ROUNDS) },
    });
    recordOp("update_password", "success", { user_id: userId });
  },

  async adminUpdatePassword(targetUserId: string, input: AdminUpdatePasswordInput) {
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundError("User not found");

    await prisma.user.update({
      where: { id: targetUserId },
      data:  { password_hash: await bcrypt.hash(input.new_password, SALT_ROUNDS) },
    });
    recordOp("admin_update_password", "success", { target_user_id: targetUserId });
  },

  async deleteUser(userId: string, password: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      recordOp("delete_account", "failure", { reason: "wrong_password", user_id: userId });
      throw new UnauthorizedError("Password is incorrect");
    }

    await prisma.user.delete({ where: { id: userId } });
    recordOp("delete_account", "success", { user_id: userId });
  },

  async adminDeleteUser(adminId: string, targetUserId: string) {
    if (adminId === targetUserId) {
      throw new ForbiddenError("Admins cannot delete their own account via this endpoint");
    }
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundError("User not found");

    await prisma.user.delete({ where: { id: targetUserId } });
    recordOp("admin_delete_user", "success", { target_user_id: targetUserId, admin_id: adminId });

    return { deleted_user: { id: target.id, username: target.username, role: target.role } };
  },

  async listUsers() {
    return prisma.user.findMany({
      select: { id: true, username: true, role: true, created_at: true },
      orderBy: { created_at: "asc" },
    });
  },

  // ─── Recovery Key / Forgot Password ────────────────────────────────────────

  /**
   * Forgot password — reset password using recovery key.
   * On success, the old recovery key is invalidated and a new one is issued.
   */
  async forgotPassword(input: ForgotPasswordInput) {
    const { username, recovery_key, new_password } = input;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      recordOp("forgot_password", "failure", { reason: "user_not_found" });
      throw new UnauthorizedError("Invalid username or recovery key");
    }

    // Check if user has a recovery key set
    if (!user.recovery_key_hash) {
      recordOp("forgot_password", "failure", { reason: "no_recovery_key", user_id: user.id });
      throw new UnauthorizedError("Invalid username or recovery key");
    }

    // Validate recovery key format
    if (!isValidRecoveryKeyFormat(recovery_key)) {
      recordOp("forgot_password", "failure", { reason: "invalid_key_format", user_id: user.id });
      throw new UnauthorizedError("Invalid username or recovery key");
    }

    // Compare recovery key hash
    const keyMatch = await bcrypt.compare(recovery_key, user.recovery_key_hash);
    if (!keyMatch) {
      recordOp("forgot_password", "failure", { reason: "wrong_recovery_key", user_id: user.id });
      throw new UnauthorizedError("Invalid username or recovery key");
    }

    // All checks passed — update password and rotate recovery key
    const newRecoveryKey = generateRecoveryKey();
    const [newPasswordHash, newRecoveryKeyHash] = await Promise.all([
      bcrypt.hash(new_password, SALT_ROUNDS),
      bcrypt.hash(newRecoveryKey, SALT_ROUNDS),
    ]);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: newPasswordHash,
        recovery_key_hash: newRecoveryKeyHash,
      },
    });

    recordOp("forgot_password", "success", { user_id: user.id });

    // Return the new recovery key (shown only once)
    return { new_recovery_key: newRecoveryKey };
  },

  /**
   * Generate first recovery key — for existing users who registered before
   * the recovery key feature was added.
   * Requires password confirmation.
   */
  async generateRecoveryKey(userId: string, password: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    // Check if user already has a recovery key
    if (user.recovery_key_hash) {
      throw new ConflictError(
        "Recovery key already exists. Use the regenerate endpoint to get a new one."
      );
    }

    // Verify password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      recordOp("generate_recovery_key", "failure", { reason: "wrong_password", user_id: userId });
      throw new UnauthorizedError("Password is incorrect");
    }

    const recoveryKey = generateRecoveryKey();
    const recovery_key_hash = await bcrypt.hash(recoveryKey, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { recovery_key_hash },
    });

    recordOp("generate_recovery_key", "success", { user_id: userId });
    return { recovery_key: recoveryKey };
  },

  /**
   * Regenerate recovery key — for authenticated users who want to rotate
   * their existing key. Requires password confirmation.
   * Invalidates the previous recovery key.
   */
  async regenerateRecoveryKey(userId: string, password: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    // Verify password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      recordOp("regenerate_recovery_key", "failure", { reason: "wrong_password", user_id: userId });
      throw new UnauthorizedError("Password is incorrect");
    }

    const recoveryKey = generateRecoveryKey();
    const recovery_key_hash = await bcrypt.hash(recoveryKey, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { recovery_key_hash },
    });

    recordOp("regenerate_recovery_key", "success", { user_id: userId });
    return { recovery_key: recoveryKey };
  },
};

// ─── Custom Error Classes ─────────────────────────────────────────────────────

export class ConflictError    extends Error { constructor(m: string) { super(m); this.name = "ConflictError"; } }
export class UnauthorizedError extends Error { constructor(m: string) { super(m); this.name = "UnauthorizedError"; } }
export class NotFoundError    extends Error { constructor(m: string) { super(m); this.name = "NotFoundError"; } }
export class ForbiddenError   extends Error { constructor(m: string) { super(m); this.name = "ForbiddenError"; } }
