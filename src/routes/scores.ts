import { Router, Response, Request } from "express";
import { z } from "zod";
import { requireAuth, AuthRequest, optionalAuth } from "../middleware/auth";
import { refreshLimiter } from "../middleware/rateLimit";
import { validateQuery } from "../middleware/validate";
import { db } from "../config/database";
import { scores, scoresHistory, platformData } from "../models/schema";
import { eq, desc } from "drizzle-orm";
import { getLeaderboard, getUserRankWithNeighbors } from "../services/leaderboard";
import { enqueueScore } from "../workers/queues";
import { redis, LEADERBOARD_KEY } from "../config/redis";
import { getScoreQueueJobStatus } from "../services/scoreQueueStatus";
import { loadScoreDashboardPayload } from "../services/scoreDashboardPayload";
import { resolveProfileUser } from "../services/profileKey";

/** One place for the “last 90 snapshots” query — public bundle + history route */
function recentScoresHistoryForUser(userId: string) {
  return db
    .select()
    .from(scoresHistory)
    .where(eq(scoresHistory.userId, userId))
    .orderBy(desc(scoresHistory.snapshotDate))
    .limit(90);
}

const router = Router();

const leaderboardQuerySchema = z.object({
  page:     z.coerce.number().min(1).default(1),
  limit:    z.coerce.number().min(1).max(100).default(50),
  platform: z.enum(["codeforces","leetcode","codechef","atcoder","hackerrank","hackerearth","topcoder","gfg","github"]).optional(),
});

// GET /scores/public/:profileKey — read-only dashboard (no auth). UUID or profile_slug; requires public profile.
// ?includeHistory=1 — attach score history in one response (avoids a second resolve + HTTP round-trip).
router.get("/public/:userId", async (req: Request, res: Response) => {
  const user = await resolveProfileUser(req.params.userId);
  if (!user) {
    res.status(400).json({ error: "Invalid profile id or slug" });
    return;
  }
  if (user.isPublic === false) {
    res.status(404).json({ error: "Profile not found or private" });
    return;
  }

  const payload = await loadScoreDashboardPayload(user.id, { user });
  if (!payload) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const wantHistory =
    req.query.includeHistory === "1" ||
    req.query.includeHistory === "true" ||
    req.query.includeHistory === "yes";

  if (wantHistory) {
    const history = await recentScoresHistoryForUser(user.id);
    res.json({ ...payload, history });
    return;
  }

  res.json(payload);
});

// GET /scores/me — full score + all platform sections for dashboard
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const payload = await loadScoreDashboardPayload(req.user!.id);
  if (!payload) {
    res.status(500).json({ error: "Could not load score profile" });
    return;
  }
  res.json(payload);
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

// GET /scores/history/:profileKey — UUID or slug. Private profiles: only owner (cookie) or public.
router.get("/history/:userId", optionalAuth, async (req: Request, res: Response) => {
  const user = await resolveProfileUser(req.params.userId);
  if (!user) {
    res.status(400).json({ error: "Invalid profile id or slug" });
    return;
  }
  const viewerId = (req as Request & { _userId?: string })._userId;
  const canView = user.isPublic !== false || viewerId === user.id;
  if (!canView) {
    res.status(404).json({ error: "Profile not found or private" });
    return;
  }

  const history = await recentScoresHistoryForUser(user.id);
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

export default router;
