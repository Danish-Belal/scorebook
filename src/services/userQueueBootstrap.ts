/**
 * Queue fetch jobs for every linked platform + a score job.
 * Used after login, manual sync, and dashboard auto-refresh so scores stay in sync with workers.
 */
import { db } from "../config/database";
import { platformProfiles } from "../models/schema";
import { eq } from "drizzle-orm";
import { enqueueFetch, enqueueScore } from "../workers/queues";
import { logger } from "../config/logger";

export async function queueFetchesAndScoreForUser(userId: string): Promise<{ queuedFetches: number }> {
  const profiles = await db
    .select()
    .from(platformProfiles)
    .where(eq(platformProfiles.userId, userId));

  let queuedFetches = 0;
  for (const p of profiles) {
    if (!p.username) continue;
    try {
      await enqueueFetch(userId, p.platform, p.username);
      queuedFetches++;
    } catch (err) {
      logger.warn(
        `[QueueBootstrap] enqueueFetch failed ${p.platform} user=${userId}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  try {
    await enqueueScore(userId);
  } catch (err) {
    logger.warn(
      `[QueueBootstrap] enqueueScore failed user=${userId}: ${err instanceof Error ? err.message : err}`
    );
  }

  logger.info(`[QueueBootstrap] user=${userId} queuedFetches=${queuedFetches} score=queued`);
  return { queuedFetches };
}
