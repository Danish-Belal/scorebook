/**
 * Adds users.profile_slug if missing (Neon / Postgres).
 * Fixes: NeonDbError: column "profile_slug" does not exist
 *
 * Run: npm run db:ensure-profile-slug
 * Requires DATABASE_URL in .env (same as the API).
 */
import * as dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env (Neon connection string).");
  process.exit(1);
}

const sql = neon(url);

async function main(): Promise<void> {
  console.log("Ensuring users.profile_slug exists…");
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_slug text`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_profile_slug_idx ON users (profile_slug)`;
  console.log("OK — profile_slug column and unique index are in place.");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
