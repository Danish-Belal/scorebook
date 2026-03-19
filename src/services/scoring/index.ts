import { db } from "../../config/database";
import { redis, LEADERBOARD_KEY, platformLeaderboardKey } from "../../config/redis";
import { platformData, scores, platformSpotlights, PlatformName } from "../../models/schema";
import { eq, inArray } from "drizzle-orm";
import { extractMetrics, computeConfidenceFactor, LOG_TRANSFORM_METRICS } from "./metrics";
import { computeRecencyFactor } from "./recency";
import { computeCompositeScore, AllPercentileContexts, PS_PLATFORMS } from "./composite";
import { logTransform } from "./percentile";
import { logger } from "../../config/logger";

export async function scoreUser(userId: string): Promise<number> {
  logger.info(`[ScoringV2] Computing score for ${userId}`);

  // 1. Load this user's platform data
  const myRows = await db.select().from(platformData).where(eq(platformData.userId, userId));
  const userMetrics: Partial<Record<PlatformName, Record<string, number>>> = {};
  const userRaw:     Partial<Record<PlatformName, any>> = {};

  for (const row of myRows) {
    if (row.fetchStatus !== "success" || !row.rawData) continue;
    try {
      const p = row.platform as PlatformName;
      userMetrics[p] = extractMetrics(p, row.rawData);
      userRaw[p]     = row.rawData;
    } catch (e: any) {
      logger.warn(`[ScoringV2] Metric extraction failed for ${row.platform}: ${e.message}`);
    }
  }

  if (Object.keys(userMetrics).length === 0) {
    logger.warn(`[ScoringV2] No usable data for user ${userId}`);
    return 0;
  }

  // 2. Build percentile contexts from all successful platform_data rows
  const allRows = await db.select().from(platformData).where(
    inArray(platformData.fetchStatus, ["success"])
  );

  // Map: "platform:metric" -> Map<userId, transformedValue>
  const metricValuesByKey = new Map<string, Map<string, number>>();

  for (const row of allRows) {
    if (!row.rawData) continue;
    try {
      const p = row.platform as PlatformName;
      const m = extractMetrics(p, row.rawData);
      for (const [name, val] of Object.entries(m)) {
        const key = `${p}:${name}`;
        if (!metricValuesByKey.has(key)) metricValuesByKey.set(key, new Map());
        const tv = LOG_TRANSFORM_METRICS.has(name) ? logTransform(val) : val;
        metricValuesByKey.get(key)!.set(row.userId, tv);
      }
    } catch {}
  }

  const percentileContexts: AllPercentileContexts = new Map();
  for (const [key, valMap] of metricValuesByKey.entries()) {
    const allValues    = Array.from(valMap.values());
    const sortedValues = [...allValues].sort((a, b) => a - b);
    percentileContexts.set(key, { allValues, sortedValues });
  }

  // 3. Recency + confidence
  const recencyFactor    = computeRecencyFactor(userRaw);
  const confidenceFactor = computeConfidenceFactor(userMetrics);

  // 4. Composite score
  // Build platform rank map for title computation
  const platformRanks: Partial<Record<any, { rank: number; total: number }>> = {};
  for (const p of PS_PLATFORMS) {
    const rank0 = await redis.zrevrank(`scorebook:leaderboard:${p}`, userId);
    const total = await redis.zcard(`scorebook:leaderboard:${p}`);
    if (rank0 !== null) platformRanks[p] = { rank: rank0 + 1, total };
  }

  const result = computeCompositeScore(userMetrics, percentileContexts, recencyFactor, confidenceFactor, platformRanks);

  logger.info(`[ScoringV2] ${userId} → final=${result.finalScore} recency=${recencyFactor} confidence=${confidenceFactor}`);

  // 5. Persist to DB
  await db.insert(scores).values({
    userId,
    compositeScore:   String(result.finalScore),
    codeforcesScore:  String(result.breakdown.codeforces  ?? 0),
    leetcodeScore:    String(result.breakdown.leetcode    ?? 0),
    codechefScore:    String(result.breakdown.codechef    ?? 0),
    atcoderScore:     String(result.breakdown.atcoder     ?? 0),
    hackerrankScore:  String(result.breakdown.hackerrank  ?? 0),
    hackerearthScore: String(result.breakdown.hackerearth ?? 0),
    topcoderScore:    String(result.breakdown.topcoder    ?? 0),
    gfgScore:         String(result.breakdown.gfg         ?? 0),
    githubScore:      String(result.breakdown.github      ?? 0),
    recencyFactor:    String(result.recencyFactor),
    confidenceFactor: String(result.confidenceFactor),
    scoreBreakdown:   result.platformScores as any,
    scoreLowerBound:  String(result.scoreLower),
    scoreUpperBound:  String(result.scoreUpper),
    computedAt:       new Date(),
  }).onConflictDoUpdate({
    target: scores.userId,
    set: {
      compositeScore:   String(result.finalScore),
      codeforcesScore:  String(result.breakdown.codeforces  ?? 0),
      leetcodeScore:    String(result.breakdown.leetcode    ?? 0),
      codechefScore:    String(result.breakdown.codechef    ?? 0),
      atcoderScore:     String(result.breakdown.atcoder     ?? 0),
      hackerrankScore:  String(result.breakdown.hackerrank  ?? 0),
      hackerearthScore: String(result.breakdown.hackerearth ?? 0),
      topcoderScore:    String(result.breakdown.topcoder    ?? 0),
      gfgScore:         String(result.breakdown.gfg         ?? 0),
      githubScore:      String(result.breakdown.github      ?? 0),
      recencyFactor:    String(result.recencyFactor),
      confidenceFactor: String(result.confidenceFactor),
      scoreBreakdown:   result.platformScores as any,
      scoreLowerBound:  String(result.scoreLower),
      scoreUpperBound:  String(result.scoreUpper),
      computedAt:       new Date(),
    },
  });

  // 6. Update global + per-platform Redis leaderboards
  await redis.zadd(LEADERBOARD_KEY, result.finalScore, userId);
  for (const pd of result.platformScores) {
    if (pd.connected) {
      await redis.zadd(platformLeaderboardKey(pd.platform), pd.platformScore, userId);
    }
  }

  // 7. Update platform spotlights (for individual platform dashboard cards)
  for (const pd of result.platformScores) {
    if (!pd.connected || !pd.spotlight) continue;
    const rank0      = await redis.zrevrank(platformLeaderboardKey(pd.platform), userId);
    const totalOnPlat = await redis.zcard(platformLeaderboardKey(pd.platform));
    await db.insert(platformSpotlights).values({
      userId,
      platform:             pd.platform,
      rating:               null,
      rank:                 rank0 !== null ? rank0 + 1 : null,
      totalUsersOnPlatform: totalOnPlat,
      percentile:           String(pd.spotlight.percentileAmongUs),
      badge:                pd.spotlight.badge,
      updatedAt:            new Date(),
    }).onConflictDoUpdate({
      target: [platformSpotlights.userId, platformSpotlights.platform] as any,
      set: {
        rank:                 rank0 !== null ? rank0 + 1 : null,
        totalUsersOnPlatform: totalOnPlat,
        percentile:           String(pd.spotlight.percentileAmongUs),
        badge:                pd.spotlight.badge,
        updatedAt:            new Date(),
      },
    });
  }

  return result.finalScore;
}
