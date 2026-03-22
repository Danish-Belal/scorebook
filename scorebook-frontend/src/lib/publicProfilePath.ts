/**
 * Public /u/… URL helpers. Regex mirrors backend `src/services/profileKey.ts` (keep in sync).
 */
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SLUG_SEGMENT = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export type PublicProfileFromSource = "leaderboard" | "home";

type EntryLike = {
  userId: string;
  profileSlug?: string | null;
  isPublic?: boolean;
};

/** Path segment only: slug if set, else UUID */
export function publicProfileSegment(entry: EntryLike): string {
  return entry.profileSlug?.trim() || entry.userId;
}

export function normalizePublicProfileSegment(raw: string): string {
  const t = raw.trim();
  if (UUID_SEGMENT.test(t)) return t;
  return t.toLowerCase();
}

export function isLikelyPublicProfileSegment(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (UUID_SEGMENT.test(t)) return true;
  const n = t.toLowerCase();
  return n.length >= 3 && n.length <= 32 && SLUG_SEGMENT.test(n);
}

/**
 * In-app link to a public profile. Null when profile is private.
 */
export function publicProfileHrefFromEntry(entry: EntryLike, source?: PublicProfileFromSource): string | null {
  if (entry.isPublic === false) return null;
  const base = `/u/${encodeURIComponent(publicProfileSegment(entry))}`;
  if (source === "leaderboard") return `${base}?from=leaderboard`;
  if (source === "home") return `${base}?from=home`;
  return base;
}

/**
 * Full URL for sharing (no ?from=…). Null when private.
 */
export function publicProfileShareUrl(origin: string, entry: EntryLike): string | null {
  if (entry.isPublic === false) return null;
  const root = origin.replace(/\/$/, "");
  return `${root}/u/${encodeURIComponent(publicProfileSegment(entry))}`;
}
