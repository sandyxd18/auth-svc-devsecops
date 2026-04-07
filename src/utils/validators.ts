// src/utils/validators.ts
// Zod schemas for input validation on auth endpoints.

import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores")
    .trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
  role: z.enum(["admin", "user"]).optional().default("user"),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required").trim(),
  password: z.string().min(1, "Password is required"),
});

// User updating their own password — must know current password first
export const updatePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128, "New password is too long"),
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "New password must be different from current password",
    path: ["new_password"],
  });

// Admin updating any user's password — no current password required
export const adminUpdatePasswordSchema = z.object({
  new_password: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "New password is too long"),
});

// Forgot password — uses recovery key to reset password
export const forgotPasswordSchema = z.object({
  username: z.string().min(1, "Username is required").trim(),
  recovery_key: z.string().min(1, "Recovery key is required"),
  new_password: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "New password is too long"),
});

// Regenerate recovery key — authenticated user, requires current password
export const regenerateRecoveryKeySchema = z.object({
  password: z.string().min(1, "Password is required"),
});

// Generate first recovery key — for existing users who don't have one yet
export const generateRecoveryKeySchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput              = z.infer<typeof registerSchema>;
export type LoginInput                 = z.infer<typeof loginSchema>;
export type UpdatePasswordInput        = z.infer<typeof updatePasswordSchema>;
export type AdminUpdatePasswordInput   = z.infer<typeof adminUpdatePasswordSchema>;
export type ForgotPasswordInput        = z.infer<typeof forgotPasswordSchema>;
export type RegenerateRecoveryKeyInput = z.infer<typeof regenerateRecoveryKeySchema>;
export type GenerateRecoveryKeyInput   = z.infer<typeof generateRecoveryKeySchema>;