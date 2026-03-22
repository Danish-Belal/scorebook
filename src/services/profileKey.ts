import { eq } from "drizzle-orm";
import { db } from "../config/database";
import { users } from "../models/schema";
import type { User } from "../models/schema";

/** Standard UUID v4-style hex pattern */
export const PROFILE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GitHub-style handle: lowercase letters, digits, hyphens; 3–32 chars */
export const PROFILE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

const RESERVED_SLUGS = new Set(
  [
    "me",
    "api",
    "auth",
    "login",
    "signup",
    "logout",
    "dashboard",
    "connect",
    "leaderboard",
    "settings",
    "admin",
    "help",
    "static",
    "public",
    "private",
    "new",
    "edit",
    "undefined",
    "null",
    "scores",
    "users",
    "platforms",
    "u",
    "_next",
    "favicon",
    "robots",
    "sitemap",
  ].map((s) => s.toLowerCase())
);

export function normalizeProfileSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

export function isValidProfileSlug(normalized: string): boolean {
  if (!normalized || normalized.length < 3 || normalized.length > 32) return false;
  if (RESERVED_SLUGS.has(normalized)) return false;
  if (/--/.test(normalized)) return false;
  return PROFILE_SLUG_RE.test(normalized);
}

/**
 * Resolve `/u/:segment` to a full user row (one DB query).
 * Used by public score routes and GET /users/:id — avoids repeat selects.
 */
export async function resolveProfileUser(raw: string): Promise<User | null> {
  const key = raw.trim();
  if (!key) return null;

  if (PROFILE_UUID_RE.test(key)) {
    const [row] = await db.select().from(users).where(eq(users.id, key)).limit(1);
    return row ?? null;
  }

  const norm = normalizeProfileSlug(key);
  if (!isValidProfileSlug(norm)) return null;

  const [row] = await db.select().from(users).where(eq(users.profileSlug, norm)).limit(1);
  return row ?? null;
}
