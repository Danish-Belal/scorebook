import {
  pgTable, uuid, text, boolean, timestamp,
  numeric, jsonb, uniqueIndex, index, integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  email:        text("email").unique(),
  displayName:  text("display_name").notNull(),
  /** bcrypt hash — null for OAuth-only accounts */
  passwordHash: text("password_hash"),
  avatarUrl:    text("avatar_url"),
  bio:          text("bio"),
  githubLogin:  text("github_login").unique(),
  googleId:     text("google_id").unique(),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastActive:   timestamp("last_active", { withTimezone: true }).defaultNow(),
  isPublic:     boolean("is_public").default(true),
}, (t) => ({
  githubIdx: index("users_github_idx").on(t.githubLogin),
}));

// ─── platform_profiles ────────────────────────────────────────────────────────
export const platformProfiles = pgTable("platform_profiles", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Supported: codeforces | leetcode | codechef | atcoder | hackerrank | hackerearth | topcoder | gfg | github
  platform:      text("platform").notNull(),
  profileUrl:    text("profile_url").notNull(),
  username:      text("username"),
  verified:      boolean("verified").default(false),
  addedAt:       timestamp("added_at", { withTimezone: true }).defaultNow(),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
}, (t) => ({
  uniqueUserPlatform: uniqueIndex("pp_user_platform_idx").on(t.userId, t.platform),
}));

// ─── platform_data ─────────────────────────────────────────────────────────────
// One row per user per platform — upserted on every fetch
export const platformData = pgTable("platform_data", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform:     text("platform").notNull(),
  rawData:      jsonb("raw_data"),   // Full fetch response — for debugging & recompute
  metrics:      jsonb("metrics"),   // Extracted numeric metrics (pre-computed)
  fetchedAt:    timestamp("fetched_at", { withTimezone: true }).defaultNow(),
  fetchStatus:  text("fetch_status").default("pending"), // pending | success | error
  errorMessage: text("error_message"),
  retryCount:   integer("retry_count").default(0),
}, (t) => ({
  uniqueUserPlatform: uniqueIndex("pd_user_platform_idx").on(t.userId, t.platform),
  statusIdx:          index("pd_status_idx").on(t.fetchStatus),
  fetchedAtIdx:       index("pd_fetched_at_idx").on(t.fetchedAt),
}));

// ─── scores ───────────────────────────────────────────────────────────────────
export const scores = pgTable("scores", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),

  // Composite final score (0–100)
  compositeScore:  numeric("composite_score", { precision: 6, scale: 2 }).notNull().default("0"),

  // Per-platform sub-scores (0–100 each)
  codeforcesScore:  numeric("codeforces_score",  { precision: 6, scale: 2 }),
  leetcodeScore:    numeric("leetcode_score",    { precision: 6, scale: 2 }),
  codechefScore:    numeric("codechef_score",    { precision: 6, scale: 2 }),
  atcoderScore:     numeric("atcoder_score",     { precision: 6, scale: 2 }),
  hackerrankScore:  numeric("hackerrank_score",  { precision: 6, scale: 2 }),
  hackerearthScore: numeric("hackerearth_score", { precision: 6, scale: 2 }),
  topcoderScore:    numeric("topcoder_score",    { precision: 6, scale: 2 }),
  gfgScore:         numeric("gfg_score",         { precision: 6, scale: 2 }),
  githubScore:      numeric("github_score",      { precision: 6, scale: 2 }),

  // Multipliers applied to composite
  recencyFactor:    numeric("recency_factor",    { precision: 4, scale: 3 }),
  confidenceFactor: numeric("confidence_factor", { precision: 4, scale: 3 }),

  // Full per-metric breakdown for transparent display in the UI
  scoreBreakdown: jsonb("score_breakdown"),

  // Score bounds (confidence interval)
  scoreLowerBound: numeric("score_lower_bound", { precision: 6, scale: 2 }),
  scoreUpperBound: numeric("score_upper_bound", { precision: 6, scale: 2 }),

  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  compositeIdx: index("scores_composite_idx").on(t.compositeScore),
}));

// ─── error_logs ──────────────────────────────────────────────────────────────
export const errorLogs = pgTable("error_logs", {
  id:        uuid("id").primaryKey().defaultRandom(),
  level:     text("level").notNull().default("error"), // 'error' | 'warn' | 'info'
  source:    text("source").notNull(),                 // 'auth' | 'fetch' | 'score' | 'api' | 'refresh'
  message:   text("message").notNull(),
  details:   jsonb("details"),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  levelIdx:  index("el_level_idx").on(t.level),
  sourceIdx: index("el_source_idx").on(t.source),
}));

// ─── scores_history ─────────────────────────────────────────────────────────
// Daily snapshots for trend charts
export const scoresHistory = pgTable("scores_history", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  compositeScore: numeric("composite_score", { precision: 6, scale: 2 }).notNull(),
  rank:           integer("rank"),
  totalUsers:     integer("total_users"),
  snapshotDate:   timestamp("snapshot_date", { withTimezone: true }).defaultNow(),
}, (t) => ({
  userDateIdx: index("sh_user_date_idx").on(t.userId, t.snapshotDate),
}));

// ─── platform_spotlights ─────────────────────────────────────────────────────
// Per-platform leaderboard positions for the individual platform sections
export const platformSpotlights = pgTable("platform_spotlights", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform:   text("platform").notNull(),
  // Key stats to show on the platform card
  rating:     integer("rating"),
  rank:       integer("platform_rank"),       // rank among ScoreBook users on this platform
  totalUsersOnPlatform: integer("total_users"),
  percentile: numeric("percentile", { precision: 5, scale: 2 }),
  badge:      text("badge"),                  // "Expert", "1800+", "5★" etc
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqueUserPlatform: uniqueIndex("ps_user_platform_idx").on(t.userId, t.platform),
}));

// ─── Relations ────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  platformProfiles: many(platformProfiles),
  platformData:     many(platformData),
  score:            one(scores, { fields: [users.id], references: [scores.userId] }),
  scoreHistory:     many(scoresHistory),
  spotlights:       many(platformSpotlights),
}));

// ─── Types ────────────────────────────────────────────────────────────────────
export type User            = typeof users.$inferSelect;
export type NewUser         = typeof users.$inferInsert;
export type PlatformProfile = typeof platformProfiles.$inferSelect;
export type PlatformData    = typeof platformData.$inferSelect;
export type Score           = typeof scores.$inferSelect;
export type ScoreHistory    = typeof scoresHistory.$inferSelect;
export type PlatformSpotlight = typeof platformSpotlights.$inferSelect;
export type ErrorLog = typeof errorLogs.$inferSelect;

export type PlatformName =
  | "codeforces" | "leetcode" | "codechef" | "atcoder"
  | "hackerrank" | "hackerearth" | "topcoder" | "gfg" | "github";

export const PLATFORM_NAMES: PlatformName[] = [
  "codeforces","leetcode","codechef","atcoder",
  "hackerrank","hackerearth","topcoder","gfg","github",
];
