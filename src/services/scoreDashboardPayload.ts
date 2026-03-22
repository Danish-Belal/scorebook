/**
 * Shared payload builder for GET /api/scores/me and GET /api/scores/public/:userId
 */
import { db } from "../config/database";
import { users, scores, platformData, platformSpotlights } from "../models/schema";
import { eq } from "drizzle-orm";
import { redis, LEADERBOARD_KEY } from "../config/redis";
import { PLATFORM_DISPLAY_NAMES } from "./fetchers";

function computeTopPercent(rank0: number, total: number): string {
  if (total === 0) return "Top 100%";
  const pct = ((rank0 + 1) / total) * 100;
  if (pct <= 1) return "Top 1%";
  if (pct <= 5) return "Top 5%";
  if (pct <= 10) return "Top 10%";
  if (pct <= 25) return "Top 25%";
  if (pct <= 50) return "Top 50%";
  return "Top 75%";
}

/** Same JSON shape as legacy GET /scores/me */
export async function loadScoreDashboardPayload(userId: string): Promise<Record<string, unknown> | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const [[scoreRow], rank0, totalUsers, spotlightRows, recentData] = await Promise.all([
    db.select().from(scores).where(eq(scores.userId, userId)).limit(1),
    redis.zrevrank(LEADERBOARD_KEY, userId),
    redis.zcard(LEADERBOARD_KEY),
    db.select().from(platformSpotlights).where(eq(platformSpotlights.userId, userId)),
    db.select().from(platformData).where(eq(platformData.userId, userId)),
  ]);

  if (!scoreRow) {
    return {
      userId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      compositeScore: 0,
      rank: null,
      totalUsers,
      message: "Connect at least one coding platform to get your score.",
      platforms: {},
    };
  }

  const platformSections: Record<string, unknown> = {};
  for (const row of recentData) {
    const spotlight = spotlightRows.find((s) => s.platform === row.platform);
    platformSections[row.platform] = {
      displayName:
        PLATFORM_DISPLAY_NAMES[row.platform as keyof typeof PLATFORM_DISPLAY_NAMES] ?? row.platform,
      fetchStatus: row.fetchStatus,
      lastFetched: row.fetchedAt,
      rawData: row.rawData,
      badge: spotlight?.badge ?? null,
      rankAmongUs: spotlight?.rank ?? null,
      totalOnPlatform: spotlight?.totalUsersOnPlatform ?? null,
      percentile: spotlight?.percentile ? parseFloat(spotlight.percentile) : null,
      subScore: scoreRow[`${row.platform}Score` as keyof typeof scoreRow]
        ? parseFloat(scoreRow[`${row.platform}Score` as keyof typeof scoreRow] as string)
        : null,
    };
  }

  return {
    userId,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    compositeScore: parseFloat(scoreRow.compositeScore),
    scoreLower: scoreRow.scoreLowerBound ? parseFloat(scoreRow.scoreLowerBound) : null,
    scoreUpper: scoreRow.scoreUpperBound ? parseFloat(scoreRow.scoreUpperBound) : null,
    rank: rank0 !== null ? rank0 + 1 : null,
    totalUsers,
    percentile: rank0 !== null ? ((totalUsers - rank0) / totalUsers * 100).toFixed(1) : null,
    recencyFactor: scoreRow.recencyFactor ? parseFloat(scoreRow.recencyFactor) : null,
    confidenceFactor: scoreRow.confidenceFactor ? parseFloat(scoreRow.confidenceFactor) : null,
    breakdown: {
      codeforces: scoreRow.codeforcesScore ? parseFloat(scoreRow.codeforcesScore) : null,
      leetcode: scoreRow.leetcodeScore ? parseFloat(scoreRow.leetcodeScore) : null,
      codechef: scoreRow.codechefScore ? parseFloat(scoreRow.codechefScore) : null,
      atcoder: scoreRow.atcoderScore ? parseFloat(scoreRow.atcoderScore) : null,
      hackerrank: scoreRow.hackerrankScore ? parseFloat(scoreRow.hackerrankScore) : null,
      hackerearth: scoreRow.hackerearthScore ? parseFloat(scoreRow.hackerearthScore) : null,
      topcoder: scoreRow.topcoderScore ? parseFloat(scoreRow.topcoderScore) : null,
      gfg: scoreRow.gfgScore ? parseFloat(scoreRow.gfgScore) : null,
      github: scoreRow.githubScore ? parseFloat(scoreRow.githubScore) : null,
    },
    detailedBreakdown: scoreRow.scoreBreakdown ?? null,
    platforms: platformSections,
    computedAt: scoreRow.computedAt,
    titles: (scoreRow.scoreBreakdown as { titles?: unknown })?.titles ?? [],
    potentialScore: (scoreRow.scoreBreakdown as { potentialScore?: unknown })?.potentialScore ?? null,
    potentialNote: (scoreRow.scoreBreakdown as { potentialNote?: unknown })?.potentialNote ?? null,
    fairnessNote: (scoreRow.scoreBreakdown as { fairness?: { note?: string } })?.fairness?.note ?? null,
    topPercent: rank0 !== null ? computeTopPercent(rank0, totalUsers) : null,
  };
}
