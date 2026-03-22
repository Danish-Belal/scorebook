import { Worker, Job } from "bullmq";
import { bullRedisConnection } from "../config/redis";
import { db } from "../config/database";
import { platformData, platformProfiles } from "../models/schema";
import { fetchPlatformData } from "../services/fetchers";
import { extractMetrics } from "../services/scoring/metrics";
import { enqueueScore, FetchJobData } from "./queues";
import { logger } from "../config/logger";
import { logError, serializeError } from "../services/errorLogger";
import { eq, and } from "drizzle-orm";

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

      // Score queue is separate — failures here must not wipe a successful fetch
      try {
        await enqueueScore(userId);
      } catch (enqueueErr: unknown) {
        const em = enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
        logger.error(`[FetchWorker] enqueueScore failed after successful fetch: ${em}`);
        void logError(
          "fetch",
          "enqueueScore failed after fetch",
          { ...serializeError(enqueueErr), platform, username, jobId: job.id },
          userId
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FetchWorker] ❌ Failed ${platform}/${username}: ${msg}`);
      void logError(
        "fetch",
        `Fetch failed: ${platform}/${username}`,
        { ...serializeError(err), platform, username, jobId: job.id },
        userId
      );
      await upsertPlatformData(userId, platform, null, "error", msg);
      throw err; // Re-throw so BullMQ retries
    }
  },
  {
    connection: bullRedisConnection,
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
    });
}

worker.on("completed", (job) => {
  logger.debug(`[FetchWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  logger.error(`[FetchWorker] Job ${job?.id} failed: ${err.message}`);
  const d = job?.data;
  void logError(
    "fetch",
    `Job permanently failed: ${job?.id}`,
    { ...serializeError(err), jobId: job?.id, ...d },
    d?.userId
  );
});

logger.info("🚀 FetchWorker started");

export { worker as fetchWorker };
