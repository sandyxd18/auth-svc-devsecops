// src/db/seed.ts
// Seeds the default admin user into the database.
// Safe to run multiple times — uses upsert, will not create duplicates.
// Run with: bun src/db/seed.ts

import bcrypt from "bcryptjs";
import prisma from "./prisma";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin@1234!";

async function seed() {
  console.log("[Seed] Starting...");

  if (ADMIN_PASSWORD === "Admin@1234!") {
    console.warn(
      "[Seed] WARNING: Using default admin password. " +
      "Set ADMIN_PASSWORD env var before running in production!"
    );
  }

  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // upsert — create if not exists, update password if already exists
  const admin = await prisma.user.upsert({
    where:  { username: ADMIN_USERNAME },
    update: { password_hash, role: "admin" }, // ensure role stays admin even if changed
    create: { username: ADMIN_USERNAME, password_hash, role: "admin" },
    select: { id: true, username: true, role: true, created_at: true },
  });

  console.log("[Seed] Default admin user ready:");
  console.log(`       username : ${admin.username}`);
  console.log(`       role     : ${admin.role}`);
  console.log(`       id       : ${admin.id}`);
  console.log("[Seed] Done.");
}

seed()
  .catch((err) => {
    console.error("[Seed] Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
