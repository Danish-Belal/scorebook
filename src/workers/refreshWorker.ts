import cron from "node-cron";
import { db } from "../config/database";
import { platformProfiles } from "../models/schema";
import { enqueueFetch } from "./queues";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { lt, or, isNull } from "drizzle-orm";

async function refreshStaleProfiles(): Promise<void> {
  const staleThreshold = new Date(
    Date.now() - env.REFRESH_INTERVAL_HOURS * 60 * 60 * 1000
  );

  // Find all profiles that haven't been fetched in REFRESH_INTERVAL_HOURS
  const staleProfiles = await db
    .select()
    .from(platformProfiles)
    .where(
      or(
        isNull(platformProfiles.lastFetchedAt),
        lt(platformProfiles.lastFetchedAt, staleThreshold)
      )
    );

  logger.info(`[RefreshWorker] Found ${staleProfiles.length} stale profiles to refresh`);

  for (const profile of staleProfiles) {
    if (!profile.username) continue;
    await enqueueFetch(profile.userId, profile.platform, profile.username);
  }

  logger.info(`[RefreshWorker] ✅ Enqueued ${staleProfiles.length} fetch jobs`);
}

// Run every hour, check for stale profiles
cron.schedule("0 * * * *", async () => {
  logger.info("[RefreshWorker] Cron triggered");
  try {
    await refreshStaleProfiles();
  } catch (err: any) {
    logger.error(`[RefreshWorker] Cron failed: ${err.message}`);
  }
});

// Also run immediately on startup
refreshStaleProfiles().catch((err) => {
  logger.error(`[RefreshWorker] Initial run failed: ${err.message}`);
});

logger.info("🚀 RefreshWorker cron started (runs every hour)");
