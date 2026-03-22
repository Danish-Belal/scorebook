import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

/** Avoid `http://localhost:3001//auth/...` — Google/GitHub require an exact redirect URI match. */
function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

const envSchema = z.object({
  // ── Database (Neon) ──────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — paste your Neon connection string"),

  // ── Redis (Upstash) ──────────────────────────────────────────────────────
  REDIS_URL: z.string().min(1, "REDIS_URL is required — paste your Upstash Redis URL"),

  // ── Auth ─────────────────────────────────────────────────────────────────
  JWT_SECRET:    z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // ── GitHub OAuth (create at github.com/settings/developers) ─────────────
  GITHUB_CLIENT_ID: z
    .string()
    .min(1, "GITHUB_CLIENT_ID required")
    .transform((s) => s.trim()),
  GITHUB_CLIENT_SECRET: z
    .string()
    .min(1, "GITHUB_CLIENT_SECRET required")
    .transform((s) => s.trim()),

  // ── Google OAuth (create at console.cloud.google.com) ────────────────────
  GOOGLE_CLIENT_ID: z
    .string()
    .min(1, "GOOGLE_CLIENT_ID required")
    .transform((s) => s.trim()),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .min(1, "GOOGLE_CLIENT_SECRET required")
    .transform((s) => s.trim()),

  // ── GitHub PAT for fetching user data (github.com/settings/tokens) ───────
  GITHUB_PAT: z.string().optional(),

  // ── App ───────────────────────────────────────────────────────────────────
  PORT:                   z.coerce.number().default(3001),
  NODE_ENV:               z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_URL: z
    .string()
    .default("http://localhost:3000")
    .transform(stripTrailingSlashes),
  OAUTH_CALLBACK_BASE_URL: z
    .string()
    .default("http://localhost:3001")
    .transform(stripTrailingSlashes),

  // ── Worker concurrency ────────────────────────────────────────────────────
  CODEFORCES_CONCURRENCY: z.coerce.number().default(3),
  LEETCODE_CONCURRENCY:   z.coerce.number().default(2),
  GITHUB_CONCURRENCY:     z.coerce.number().default(10),
  ATCODER_CONCURRENCY:    z.coerce.number().default(2),
  GFG_CONCURRENCY:        z.coerce.number().default(2),
  REFRESH_INTERVAL_HOURS: z.coerce.number().default(24),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n❌ Missing or invalid environment variables:\n");
  for (const [field, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`   ${field}: ${(errors as string[]).join(", ")}`);
  }
  console.error("\n👉 Copy .env.example to .env and fill in the values.\n");
  process.exit(1);
}

export const env = parsed.data;
