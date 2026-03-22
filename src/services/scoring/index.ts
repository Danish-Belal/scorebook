import { db } from "../../config/database";
import { redis, LEADERBOARD_KEY, platformLeaderboardKey } from "../../config/redis";
import {
  platformData,
  scores,
  scoresHistory,
  platformSpotlights,
  PlatformName,
  PLATFORM_NAMES,
} from "../../models/schema";
import { eq, inArray } from "drizzle-orm";
import { extractMetrics, computeConfidenceFactor, LOG_TRANSFORM_METRICS } from "./metrics";
import { computeRecencyFactor } from "./recency";
import { computeCompositeScore, AllPercentileContexts, PS_PLATFORMS } from "./composite";
import { logTransform } from "./percentile";
import { logger } from "../../config/logger";

/** Returned to the score worker for logging (console + `error_logs`). */
export type ScoreUserResult = {
  finalScore: number;
  /** JSON-safe payload describing the scoring outcome */
  response: Record<string, unknown>;
};

/** Append one row per successful score job so dashboard history charts read from DB. */
async function recordScoreHistorySnapshot(
  userId: string,
  compositeScore: number,
  rank1Based: number | null,
  totalUsersOnLeaderboard: number | null
): Promise<void> {
  try {
    await db.insert(scoresHistory).values({
      userId,
      compositeScore: String(compositeScore),
      rank: rank1Based,
      totalUsers: totalUsersOnLeaderboard,
      snapshotDate: new Date(),
    });
    logger.info(
      `[ScoringV2] scores_history snapshot user=${userId} score=${compositeScore} rank=${rank1Based ?? "—"} total=${totalUsersOnLeaderboard ?? "—"}`
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`[ScoringV2] scores_history insert failed user=${userId}: ${msg}`);
  }
}

/** When no metrics can be extracted, still write a `scores` row so the dashboard and queue-status stay consistent. */
async function persistSkippedScore(userId: string, reason: string): Promise<void> {
  const zero = "0";
  const breakdown = {
    scoringSkipped: true,
    reason,
    note:
      reason === "no_success_platform_data"
        ? "No platform rows with fetch_status=success and raw data."
        : "Platform data exists but metric extraction failed for every platform (check raw JSON / parsers).",
  };
  await db
    .insert(scores)
    .values({
      userId,
      compositeScore: zero,
      codeforcesScore: zero,
      leetcodeScore: zero,
      codechefScore: zero,
      atcoderScore: zero,
      hackerrankScore: zero,
      hackerearthScore: zero,
      topcoderScore: zero,
      gfgScore: zero,
      githubScore: zero,
      recencyFactor: zero,
      confidenceFactor: zero,
      scoreBreakdown: breakdown as unknown as Record<string, unknown>,
      scoreLowerBound: zero,
      scoreUpperBound: zero,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: scores.userId,
      set: {
        compositeScore: zero,
        codeforcesScore: zero,
        leetcodeScore: zero,
        codechefScore: zero,
        atcoderScore: zero,
        hackerrankScore: zero,
        hackerearthScore: zero,
        topcoderScore: zero,
        gfgScore: zero,
        githubScore: zero,
        recencyFactor: zero,
        confidenceFactor: zero,
        scoreBreakdown: breakdown as unknown as Record<string, unknown>,
        scoreLowerBound: zero,
        scoreUpperBound: zero,
        computedAt: new Date(),
      },
    });
  logger.warn(`[ScoringV2] Persisted skipped score user=${userId} reason=${reason}`);

  const totalUsers = await redis.zcard(LEADERBOARD_KEY);
  const rank0 = await redis.zrevrank(LEADERBOARD_KEY, userId);
  const rank1 = rank0 !== null ? rank0 + 1 : null;
  await recordScoreHistorySnapshot(userId, 0, rank1, totalUsers);
}

export async function scoreUser(userId: string): Promise<ScoreUserResult> {
  logger.info(`[ScoringV2] Computing score for ${userId}`);

  // 1. Load this user's platform data
  const myRows = await db.select().from(platformData).where(eq(platformData.userId, userId));
  const userMetrics: Partial<Record<PlatformName, Record<string, number>>> = {};
  const userRaw:     Partial<Record<PlatformName, any>> = {};

  for (const row of myRows) {
    if (row.fetchStatus !== "success" || !row.rawData) continue;
    const normalized = String(row.platform ?? "")
      .trim()
      .toLowerCase() as PlatformName;
    if (!PLATFORM_NAMES.includes(normalized)) {
      logger.warn(`[ScoringV2] Unknown platform key in DB "${row.platform}" — skipping row`);
      continue;
    }
    try {
      userMetrics[normalized] = extractMetrics(normalized, row.rawData);
      userRaw[normalized]     = row.rawData;
    } catch (e: any) {
      logger.warn(`[ScoringV2] Metric extraction failed for ${row.platform}: ${e.message}`);
    }
  }

  if (Object.keys(userMetrics).length === 0) {
    const successRows = myRows.filter((r) => r.fetchStatus === "success" && r.rawData).length;
    const reason =
      successRows === 0 ? "no_success_platform_data" : "metrics_extraction_failed_all_platforms";
    logger.warn(`[ScoringV2] No usable metrics for user ${userId} (${reason}, successRows=${successRows})`);
    await persistSkippedScore(userId, reason);
    const skippedResponse: Record<string, unknown> = {
      path: "skipped",
      reason,
      successRows,
      finalScore: 0,
      scoringSkipped: true,
    };
    return { finalScore: 0, response: skippedResponse };
  }

  // 2. Build percentile contexts from all successful platform_data rows
  const allRows = await db.select().from(platformData).where(
    inArray(platformData.fetchStatus, ["success"])
  );

  // Map: "platform:metric" -> Map<userId, transformedValue>
  const metricValuesByKey = new Map<string, Map<string, number>>();

  for (const row of allRows) {
    if (!row.rawData) continue;
    const p = String(row.platform ?? "")
      .trim()
      .toLowerCase() as PlatformName;
    if (!PLATFORM_NAMES.includes(p)) continue;
    try {
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

  // 4. Composite score — parallel Redis reads per PS platform
  const platformRanks: Partial<Record<PlatformName, { rank: number; total: number }>> = {};
  const rankTuples = await Promise.all(
    PS_PLATFORMS.map(async (p) => {
      const key = platformLeaderboardKey(p);
      const [rank0, total] = await Promise.all([
        redis.zrevrank(key, userId),
        redis.zcard(key),
      ]);
      return { p, rank0, total };
    })
  );
  for (const { p, rank0, total } of rankTuples) {
    if (rank0 !== null) platformRanks[p] = { rank: rank0 + 1, total };
  }

  const result = computeCompositeScore(userMetrics, percentileContexts, recencyFactor, confidenceFactor, platformRanks);

  logger.info(`[ScoringV2] ${userId} → final=${result.finalScore} recency=${recencyFactor} confidence=${confidenceFactor}`);

  const scoreBreakdown = {
    platformScores: result.platformScores,
    titles: result.titles,
    potentialScore: result.potentialScore,
    potentialNote: result.potentialNote,
    fairness: result.fairness,
    psScore: result.psScore,
    engScore: result.engScore,
    brScore: result.brScore,
    psWeight: result.psWeight,
    engWeight: result.engWeight,
    brWeight: result.brWeight,
  } as any;

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
    scoreBreakdown,
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
      scoreBreakdown,
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

  // 7. Update platform spotlights (parallel per connected platform with spotlight)
  await Promise.all(
    result.platformScores
      .filter((pd) => pd.connected && pd.spotlight)
      .map(async (pd) => {
        const rk = platformLeaderboardKey(pd.platform);
        const [rank0, totalOnPlat] = await Promise.all([
          redis.zrevrank(rk, userId),
          redis.zcard(rk),
        ]);
        await db.insert(platformSpotlights).values({
          userId,
          platform:             pd.platform,
          rating:               null,
          rank:                 rank0 !== null ? rank0 + 1 : null,
          totalUsersOnPlatform: totalOnPlat,
          percentile:           String(pd.spotlight!.percentileAmongUs),
          badge:                pd.spotlight!.badge,
          updatedAt:            new Date(),
        }).onConflictDoUpdate({
          target: [platformSpotlights.userId, platformSpotlights.platform],
          set: {
            rank:                 rank0 !== null ? rank0 + 1 : null,
            totalUsersOnPlatform: totalOnPlat,
            percentile:           String(pd.spotlight!.percentileAmongUs),
            badge:                pd.spotlight!.badge,
            updatedAt:            new Date(),
          },
        });
      })
  );

  // 8. History chart — one row per queue-driven score run (dashboard GET /scores/history)
  const rank0Global = await redis.zrevrank(LEADERBOARD_KEY, userId);
  const totalOnGlobal = await redis.zcard(LEADERBOARD_KEY);
  const rank1Global = rank0Global !== null ? rank0Global + 1 : null;
  await recordScoreHistorySnapshot(userId, result.finalScore, rank1Global, totalOnGlobal);

  const fullResponse: Record<string, unknown> = {
    path: "full",
    finalScore: result.finalScore,
    recencyFactor,
    confidenceFactor,
    scoreLower: result.scoreLower,
    scoreUpper: result.scoreUpper,
    breakdown: result.breakdown,
    platformScores: result.platformScores.map((pd) => ({
      platform: pd.platform,
      connected: pd.connected,
      platformScore: pd.platformScore,
      percentileAmongUs: pd.spotlight?.percentileAmongUs ?? null,
      badge: pd.spotlight?.badge ?? null,
    })),
    rankGlobal: rank1Global,
    totalUsersGlobal: totalOnGlobal,
  };

  return { finalScore: result.finalScore, response: fullResponse };
}
