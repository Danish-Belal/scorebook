import { Router, Response, Request } from "express";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { refreshLimiter } from "../middleware/rateLimit";
import { validateQuery } from "../middleware/validate";
import { db } from "../config/database";
import { scores, scoresHistory, platformData, platformSpotlights } from "../models/schema";
import { eq, desc } from "drizzle-orm";
import { getLeaderboard, getUserRankWithNeighbors } from "../services/leaderboard";
import { enqueueScore } from "../workers/queues";
import { redis, LEADERBOARD_KEY } from "../config/redis";
import { getScoreQueueJobStatus } from "../services/scoreQueueStatus";
import { PLATFORM_DISPLAY_NAMES } from "../services/fetchers";

const router = Router();

const leaderboardQuerySchema = z.object({
  page:     z.coerce.number().min(1).default(1),
  limit:    z.coerce.number().min(1).max(100).default(50),
  platform: z.enum(["codeforces","leetcode","codechef","atcoder","hackerrank","hackerearth","topcoder","gfg","github"]).optional(),
});

// GET /scores/me — full score + all platform sections for dashboard
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const [[scoreRow], rank0, totalUsers, spotlightRows, recentData] = await Promise.all([
    db.select().from(scores).where(eq(scores.userId, userId)).limit(1),
    redis.zrevrank(LEADERBOARD_KEY, userId),
    redis.zcard(LEADERBOARD_KEY),
    db.select().from(platformSpotlights).where(eq(platformSpotlights.userId, userId)),
    db.select().from(platformData).where(eq(platformData.userId, userId)),
  ]);

  if (!scoreRow) {
    res.json({
      userId,
      displayName:      req.user!.displayName,
      avatarUrl:        req.user!.avatarUrl,
      compositeScore: 0,
      rank: null,
      totalUsers,
      message: "Connect at least one coding platform to get your score.",
      platforms: {},
    });
    return;
  }

  // Build per-platform dashboard sections
  const platformSections: Record<string, any> = {};
  for (const row of recentData) {
    const spotlight = spotlightRows.find(s => s.platform === row.platform);
    platformSections[row.platform] = {
      displayName:  PLATFORM_DISPLAY_NAMES[row.platform as keyof typeof PLATFORM_DISPLAY_NAMES] ?? row.platform,
      fetchStatus:  row.fetchStatus,
      lastFetched:  row.fetchedAt,
      rawData:      row.rawData,   // Full raw stats shown on dashboard card
      badge:        spotlight?.badge ?? null,
      rankAmongUs:  spotlight?.rank ?? null,
      totalOnPlatform: spotlight?.totalUsersOnPlatform ?? null,
      percentile:   spotlight?.percentile ? parseFloat(spotlight.percentile) : null,
      subScore:     scoreRow[`${row.platform}Score` as keyof typeof scoreRow]
                      ? parseFloat(scoreRow[`${row.platform}Score` as keyof typeof scoreRow] as string)
                      : null,
    };
  }

  res.json({
    userId,
    displayName:      req.user!.displayName,
    avatarUrl:        req.user!.avatarUrl,
    compositeScore:   parseFloat(scoreRow.compositeScore),
    scoreLower:       scoreRow.scoreLowerBound ? parseFloat(scoreRow.scoreLowerBound) : null,
    scoreUpper:       scoreRow.scoreUpperBound ? parseFloat(scoreRow.scoreUpperBound) : null,
    rank:             rank0 !== null ? rank0 + 1 : null,
    totalUsers,
    // "Top X%" is more intuitive than a raw percentile number
    percentile:       rank0 !== null ? ((totalUsers - rank0) / totalUsers * 100).toFixed(1) : null,
    topPercent:       rank0 !== null ? computeTopPercent(rank0, totalUsers) : null,
    recencyFactor:    scoreRow.recencyFactor ? parseFloat(scoreRow.recencyFactor) : null,
    confidenceFactor: scoreRow.confidenceFactor ? parseFloat(scoreRow.confidenceFactor) : null,
    breakdown: {
      codeforces:  scoreRow.codeforcesScore  ? parseFloat(scoreRow.codeforcesScore)  : null,
      leetcode:    scoreRow.leetcodeScore    ? parseFloat(scoreRow.leetcodeScore)    : null,
      codechef:    scoreRow.codechefScore    ? parseFloat(scoreRow.codechefScore)    : null,
      atcoder:     scoreRow.atcoderScore     ? parseFloat(scoreRow.atcoderScore)     : null,
      hackerrank:  scoreRow.hackerrankScore  ? parseFloat(scoreRow.hackerrankScore)  : null,
      hackerearth: scoreRow.hackerearthScore ? parseFloat(scoreRow.hackerearthScore) : null,
      topcoder:    scoreRow.topcoderScore    ? parseFloat(scoreRow.topcoderScore)    : null,
      gfg:         scoreRow.gfgScore         ? parseFloat(scoreRow.gfgScore)         : null,
      github:      scoreRow.githubScore      ? parseFloat(scoreRow.githubScore)      : null,
    },
    detailedBreakdown: scoreRow.scoreBreakdown, // Full per-metric percentiles
    platforms: platformSections,               // ← Individual platform cards for dashboard
    computedAt: scoreRow.computedAt,
    // Specialty titles earned on individual platforms
    titles:         (scoreRow.scoreBreakdown as any)?.titles ?? [],
    // What score could this user reach?
    potentialScore: (scoreRow.scoreBreakdown as any)?.potentialScore ?? null,
    potentialNote:  (scoreRow.scoreBreakdown as any)?.potentialNote  ?? null,
    // Human-readable fairness explanation
    fairnessNote:   (scoreRow.scoreBreakdown as any)?.fairness?.note ?? null,
  });
});

// GET /scores/leaderboard
router.get("/leaderboard", validateQuery(leaderboardQuerySchema), async (req: Request, res: Response) => {
  const { page, limit, platform } = (req as any).validatedQuery;
  const { entries, totalUsers } = await getLeaderboard(page, limit, platform);
  res.json({ entries, pagination: { page, limit, totalUsers, totalPages: Math.ceil(totalUsers / limit) } });
});

// GET /scores/rank/:userId
router.get("/rank/:userId", async (req: Request, res: Response) => {
  const result = await getUserRankWithNeighbors(req.params.userId);
  if (!result) { res.status(404).json({ error: "Not in leaderboard yet" }); return; }
  res.json(result);
});

// GET /scores/history/:userId
router.get("/history/:userId", async (req: Request, res: Response) => {
  const history = await db.select().from(scoresHistory)
    .where(eq(scoresHistory.userId, req.params.userId))
    .orderBy(desc(scoresHistory.snapshotDate))
    .limit(90);
  res.json({ history });
});

// GET /scores/queue-status — BullMQ `compute-score` job + DB snapshot (dashboard spinner / errors)
router.get("/queue-status", requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const [jobStatus, platformRows, scoreRows] = await Promise.all([
    getScoreQueueJobStatus(userId),
    db
      .select({ fetchStatus: platformData.fetchStatus })
      .from(platformData)
      .where(eq(platformData.userId, userId)),
    db.select().from(scores).where(eq(scores.userId, userId)).limit(1),
  ]);
  const scoreRow = scoreRows[0];

  const pendingFetches = platformRows.filter((r) => r.fetchStatus === "pending").length;
  const errorFetches = platformRows.filter((r) => r.fetchStatus === "error").length;
  const successFetches = platformRows.filter((r) => r.fetchStatus === "success").length;

  const zscoreRaw = await redis.zscore(LEADERBOARD_KEY, userId);
  const redisGlobalScore = zscoreRaw != null ? parseFloat(zscoreRaw) : null;

  res.json({
    job: jobStatus,
    redisLeaderboard: {
      key: LEADERBOARD_KEY,
      globalScore: redisGlobalScore,
      isMember: zscoreRaw != null,
    },
    platformFetch: {
      pending: pendingFetches,
      error: errorFetches,
      success: successFetches,
      total: platformRows.length,
    },
    database: {
      hasScoreRow: !!scoreRow,
      compositeScore: scoreRow ? parseFloat(scoreRow.compositeScore) : null,
      computedAt: scoreRow?.computedAt ?? null,
    },
  });
});

// POST /scores/refresh — manual trigger (rate limited: once per minute per user)
router.post("/refresh", requireAuth, refreshLimiter, async (req: AuthRequest, res: Response) => {
  await enqueueScore(req.user!.id);
  res.json({ success: true, message: "Refresh queued — score will update within a few minutes." });
});


// Converts rank into a human-readable "top X%" label
// e.g. rank 1/500 → "Top 1%", rank 50/500 → "Top 10%", rank 450/500 → "Top 90%"
function computeTopPercent(rank0: number, total: number): string {
  if (total === 0) return "Top 100%";
  const pct = ((rank0 + 1) / total) * 100;
  if (pct <= 1)  return "Top 1%";
  if (pct <= 5)  return "Top 5%";
  if (pct <= 10) return "Top 10%";
  if (pct <= 25) return "Top 25%";
  if (pct <= 50) return "Top 50%";
  return "Top 75%";
}

export default router;
