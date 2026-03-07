/**
 * Seed default admin: pasfiesta2026@gmail.com / pasc2026
 * Run: npx ts-node src/scripts/seedAdmin.ts
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import { connectDb } from "../config/db";
import { Admin } from "../models/Admin";

const DEFAULT_ADMIN_EMAIL = "pasfiesta2026@gmail.com";
const DEFAULT_ADMIN_PASSWORD = "pasc2026";

async function seed(): Promise<void> {
  await connectDb();
  const existing = await Admin.findOne({ email: DEFAULT_ADMIN_EMAIL }).lean();
  if (existing) {
    console.log("Admin already exists:", DEFAULT_ADMIN_EMAIL);
    process.exit(0);
    return;
  }
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  await Admin.create({ email: DEFAULT_ADMIN_EMAIL, passwordHash });
  console.log("Admin created:", DEFAULT_ADMIN_EMAIL);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
