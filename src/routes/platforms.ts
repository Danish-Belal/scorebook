import { Router, Response, Request } from "express";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { db } from "../config/database";
import { platformProfiles, platformData } from "../models/schema";
import { PLATFORM_NAMES } from "../models/schema";
import { eq, and } from "drizzle-orm";
import { extractUsername, detectPlatformFromUrl, PLATFORM_EXAMPLES, PLATFORM_DISPLAY_NAMES } from "../services/fetchers";
import { enqueueFetch } from "../workers/queues";
import { queueFetchesAndScoreForUser } from "../services/userQueueBootstrap";
import { logger } from "../config/logger";
import type { RequestHandler } from "express";

const router = Router();

const connectSchema = z.object({
  profileUrl: z.string().url("Must be a valid URL"),
  platform: z.enum([
    "codeforces","leetcode","github","atcoder","gfg",
    "codechef","hackerrank","hackerearth","topcoder"
  ]).optional(),
});

// POST /platforms/connect
router.post("/connect", requireAuth, validateBody(connectSchema), async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { profileUrl } = req.body;
  let { platform } = req.body;

  if (!platform) {
    platform = detectPlatformFromUrl(profileUrl);
    if (!platform) {
      res.status(400).json({
        error: "Could not detect platform from URL. Please specify platform explicitly.",
        supportedPlatforms: PLATFORM_NAMES,
        examples: PLATFORM_EXAMPLES,
      });
      return;
    }
  }

  const username = extractUsername(platform, profileUrl);
  if (!username) {
    res.status(400).json({
      error: `Could not extract username from URL for platform: ${platform}`,
      example: PLATFORM_EXAMPLES[platform as keyof typeof PLATFORM_EXAMPLES],
    });
    return;
  }

  await db.insert(platformProfiles)
    .values({ userId, platform, profileUrl, username })
    .onConflictDoUpdate({
      target: [platformProfiles.userId, platformProfiles.platform],
      set: { profileUrl, username, addedAt: new Date() },
    });

  await enqueueFetch(userId, platform, username);
  logger.info(`[Platforms] User ${userId} connected ${platform}/${username}`);

  res.status(202).json({
    success:  true,
    platform,
    platformName: PLATFORM_DISPLAY_NAMES[platform as keyof typeof PLATFORM_DISPLAY_NAMES],
    username,
    message: "Profile connected. Data fetch queued — your score updates within a few minutes.",
  });
});

// POST /platforms/sync — re-queue fetch for every linked profile + score job (same as post-login bootstrap)
router.post("/sync", requireAuth as RequestHandler, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user!.id;
  const { queuedFetches } = await queueFetchesAndScoreForUser(userId);

  logger.info(`[Platforms] User ${userId} triggered sync: ${queuedFetches} fetch(es) + score`);
  res.status(202).json({
    success: true,
    queued: queuedFetches,
    message:
      queuedFetches > 0
        ? `Queued ${queuedFetches} fetch job(s) and score calculation. Allow ~1–3 minutes, then refresh the dashboard.`
        : "No linked profiles with usernames — score recalculation was still queued. Add platforms on Connect if needed.",
  });
});

// GET /platforms — list all connected platforms + fetch status
router.get("/", requireAuth as RequestHandler, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user!.id;
  const [profiles, dataRows] = await Promise.all([
    db.select().from(platformProfiles).where(eq(platformProfiles.userId, userId)),
    db.select().from(platformData).where(eq(platformData.userId, userId)),
  ]);

  const dataMap = new Map(dataRows.map(d => [d.platform, d]));
  const result = profiles.map(p => {
    const data = dataMap.get(p.platform);
    const err = data?.errorMessage ?? null;
    return {
      platform:      p.platform,
      displayName:   PLATFORM_DISPLAY_NAMES[p.platform as keyof typeof PLATFORM_DISPLAY_NAMES] ?? p.platform,
      profileUrl:    p.profileUrl,
      username:      p.username,
      addedAt:       p.addedAt,
      lastFetchedAt: p.lastFetchedAt,
      fetchStatus:   data?.fetchStatus ?? "pending",
      errorMessage:  err,
      retryCount:    data?.retryCount ?? 0,
      /** True when a re-sync usually fixes the issue (e.g. old BullMQ jobId bug). */
      recoverableSyncError:
        typeof err === "string" &&
        (err.includes("Custom Id cannot contain") || err.includes("cannot contain :")),
    };
  });

  res.json({
    platforms: result,
    hint:
      result.some((r) => r.recoverableSyncError)
        ? "Some sync errors are from a fixed server bug. Click “Re-sync all data” on the dashboard (or POST /api/platforms/sync) after restarting the app, then wait 1–3 minutes."
        : undefined,
  });
});

// DELETE /platforms/:platform
router.delete("/:platform", requireAuth, async (req: AuthRequest, res: Response) => {
  const userId   = req.user!.id;
  const platform = req.params.platform;

  await db.delete(platformProfiles).where(
    and(eq(platformProfiles.userId, userId), eq(platformProfiles.platform, platform))
  );
  await db.delete(platformData).where(
    and(eq(platformData.userId, userId), eq(platformData.platform, platform))
  );

  res.json({ success: true, message: `${platform} disconnected.` });
});

export default router;
