import { Worker, Job } from "bullmq";
import { redisForBull } from "../config/redis";
import { db } from "../config/database";
import { platformData, platformProfiles } from "../models/schema";
import { fetchPlatformData } from "../services/fetchers";
import { extractMetrics } from "../services/scoring/metrics";
import { enqueueScore, FetchJobData } from "./queues";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { eq, and } from "drizzle-orm";

const CONCURRENCY_MAP: Record<string, number> = {
  codeforces: env.CODEFORCES_CONCURRENCY,
  leetcode:   env.LEETCODE_CONCURRENCY,
  github:     env.GITHUB_CONCURRENCY,
  atcoder:    env.ATCODER_CONCURRENCY,
  gfg:        env.GFG_CONCURRENCY,
};

const worker = new Worker<FetchJobData>(
  "fetch-platform-data",
  async (job: Job<FetchJobData>) => {
    const { userId, platform, username } = job.data;

    logger.info(`[FetchWorker] Processing: ${platform}/${username} for user ${userId}`);

    try {
      // Mark as in-progress
      await upsertPlatformData(userId, platform, null, "pending", null);

      // Fetch from platform
      const rawData = await fetchPlatformData(platform as any, username);

      // Extract metrics (validate the data is parseable)
      const metrics = extractMetrics(platform as any, rawData);

      // Persist to DB
      await upsertPlatformData(userId, platform, rawData, "success", null, metrics);

      // Update profile last_fetched_at
      await db
        .update(platformProfiles)
        .set({ lastFetchedAt: new Date() })
        .where(
          and(
            eq(platformProfiles.userId, userId),
            eq(platformProfiles.platform, platform)
          )
        );

      logger.info(`[FetchWorker] ✅ Fetched ${platform}/${username}`);

      // Trigger score recomputation
      await enqueueScore(userId);
    } catch (err: any) {
      logger.error(`[FetchWorker] ❌ Failed ${platform}/${username}: ${err.message}`);
      await upsertPlatformData(userId, platform, null, "error", err.message);
      throw err; // Re-throw so BullMQ retries
    }
  },
  {
    connection: redisForBull,
    concurrency: 5, // Total concurrency across all platforms
    limiter: {
      max: 10,
      duration: 1000, // Max 10 jobs per second globally
    },
  }
);

async function upsertPlatformData(
  userId: string,
  platform: string,
  rawData: any,
  fetchStatus: string,
  errorMessage: string | null,
  metrics?: any
): Promise<void> {
  await db
    .insert(platformData)
    .values({
      userId,
      platform,
      rawData,
      metrics,
      fetchStatus,
      errorMessage,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [platformData.userId, platformData.platform],
      set: {
        rawData,
        metrics,
        fetchStatus,
        errorMessage,
        fetchedAt: new Date(),
      },
    } as any);
}

worker.on("completed", (job) => {
  logger.debug(`[FetchWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  logger.error(`[FetchWorker] Job ${job?.id} failed: ${err.message}`);
});

logger.info("🚀 FetchWorker started");

export { worker as fetchWorker };
