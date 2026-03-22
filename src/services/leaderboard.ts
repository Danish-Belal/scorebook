import { redis, LEADERBOARD_KEY, platformLeaderboardKey } from "../config/redis";
import { db } from "../config/database";
import { users, scores } from "../models/schema";
import { inArray, eq } from "drizzle-orm";

export interface LeaderboardEntry {
  rank:           number;
  userId:         string;
  displayName:    string;
  avatarUrl:      string | null;
  githubLogin:    string | null;
  score:          number;
  topPercent:     string;   // e.g. "Top 10%"
  codeforcesScore?: number;
  leetcodeScore?:   number;
  githubScore?:     number;
  atcoderScore?:    number;
  gfgScore?:        number;
}

/**
 * Get paginated leaderboard from Redis + enrich with user data from DB.
 * O(log N + limit) — sub-millisecond even at 100M users.
 */
export async function getLeaderboard(
  page: number = 1,
  limit: number = 50,
  platform?: string
): Promise<{ entries: LeaderboardEntry[]; totalUsers: number }> {
  const key = platform ? platformLeaderboardKey(platform) : LEADERBOARD_KEY;

  const start = (page - 1) * limit;
  const stop  = start + limit - 1;

  // ZREVRANGE: highest score first
  const results = await redis.zrevrange(key, start, stop, "WITHSCORES");
  const totalUsers = await redis.zcard(key);

  if (results.length === 0) {
    return { entries: [], totalUsers };
  }

  // Parse [userId, score, userId, score, ...]
  const userIds: string[] = [];
  const scoreMap = new Map<string, number>();

  for (let i = 0; i < results.length; i += 2) {
    const userId = results[i];
    const score  = parseFloat(results[i + 1]);
    userIds.push(userId);
    scoreMap.set(userId, score);
  }

  // Fetch user info + sub-scores from DB
  const [userRows, scoreRows] = await Promise.all([
    db.select().from(users).where(inArray(users.id, userIds)),
    db.select().from(scores).where(inArray(scores.userId, userIds)),
  ]);

  const userMap  = new Map(userRows.map((u) => [u.id, u]));
  const scoreDbMap = new Map(scoreRows.map((s) => [s.userId, s]));

  const entries: LeaderboardEntry[] = userIds.map((userId, idx) => {
    const user    = userMap.get(userId);
    const scoreDb = scoreDbMap.get(userId);
    return {
      rank:           start + idx + 1,
      userId,
      displayName:    user?.displayName ?? "Unknown",
      avatarUrl:      user?.avatarUrl ?? null,
      githubLogin:    user?.githubLogin ?? null,
      score:          scoreMap.get(userId) ?? 0,
      topPercent:     leaderboardTopPercent(start + idx, totalUsers),
      codeforcesScore: scoreDb?.codeforcesScore ? parseFloat(scoreDb.codeforcesScore) : undefined,
      leetcodeScore:   scoreDb?.leetcodeScore   ? parseFloat(scoreDb.leetcodeScore)   : undefined,
      githubScore:     scoreDb?.githubScore      ? parseFloat(scoreDb.githubScore)     : undefined,
      atcoderScore:    scoreDb?.atcoderScore     ? parseFloat(scoreDb.atcoderScore)    : undefined,
      gfgScore:        scoreDb?.gfgScore         ? parseFloat(scoreDb.gfgScore)        : undefined,
    };
  });

  return { entries, totalUsers };
}

/**
 * Get a user's rank and their 5 neighbors above and below.
 * Returns rank (1-indexed), total users, and surrounding entries.
 */
export async function getUserRankWithNeighbors(userId: string): Promise<{
  rank: number;
  totalUsers: number;
  neighbors: LeaderboardEntry[];
} | null> {
  const rank0 = await redis.zrevrank(LEADERBOARD_KEY, userId);
  if (rank0 === null) return null;

  const rank       = rank0 + 1;
  const totalUsers = await redis.zcard(LEADERBOARD_KEY);

  const start = Math.max(0, rank0 - 5);
  const stop  = rank0 + 5;

  const results = await redis.zrevrange(
    LEADERBOARD_KEY,
    start,
    stop,
    "WITHSCORES"
  );

  const userIds: string[] = [];
  const scoreMap = new Map<string, number>();
  for (let i = 0; i < results.length; i += 2) {
    userIds.push(results[i]);
    scoreMap.set(results[i], parseFloat(results[i + 1]));
  }

  const userRows = await db
    .select()
    .from(users)
    .where(inArray(users.id, userIds));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const neighbors: LeaderboardEntry[] = userIds.map((uid, idx) => ({
    rank:        start + idx + 1,
    userId:      uid,
    displayName: userMap.get(uid)?.displayName ?? "Unknown",
    avatarUrl:   userMap.get(uid)?.avatarUrl ?? null,
    githubLogin: userMap.get(uid)?.githubLogin ?? null,
    score:       scoreMap.get(uid) ?? 0,
    topPercent:  leaderboardTopPercent(start + idx, totalUsers),
  }));

  return { rank, totalUsers, neighbors };
}

function leaderboardTopPercent(rank0: number, total: number): string {
  if (total === 0) return "Top 100%";
  const pct = ((rank0 + 1) / total) * 100;
  if (pct <= 1)  return "Top 1%";
  if (pct <= 5)  return "Top 5%";
  if (pct <= 10) return "Top 10%";
  if (pct <= 25) return "Top 25%";
  if (pct <= 50) return "Top 50%";
  return "Top 75%";
}
