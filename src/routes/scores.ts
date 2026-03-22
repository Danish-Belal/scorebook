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
import { loadScoreDashboardPayload } from "../services/scoreDashboardPayload";
import { users } from "../models/schema";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const leaderboardQuerySchema = z.object({
  page:     z.coerce.number().min(1).default(1),
  limit:    z.coerce.number().min(1).max(100).default(50),
  platform: z.enum(["codeforces","leetcode","codechef","atcoder","hackerrank","hackerearth","topcoder","gfg","github"]).optional(),
});

// GET /scores/public/:userId — read-only dashboard payload (no auth). Requires public profile.
router.get("/public/:userId", async (req: Request, res: Response) => {
  const userId = req.params.userId;
  if (!UUID_RE.test(userId)) {
    res.status(400).json({ error: "Invalid profile id" });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.isPublic === false) {
    res.status(404).json({ error: "Profile not found or private" });
    return;
  }

  const payload = await loadScoreDashboardPayload(userId);
  if (!payload) {
    res.status(404).json({ error: "Profile not found" });
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

export default router;
