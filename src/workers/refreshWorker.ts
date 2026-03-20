import cron from "node-cron";
import { db } from "../config/database";
import { platformProfiles } from "../models/schema";
import { enqueueFetch } from "./queues";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { logError, serializeError } from "../services/errorLogger";
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[RefreshWorker] Cron failed: ${msg}`);
    void logError("refresh", "Cron refreshStaleProfiles failed", serializeError(err));
  }
});

// Also run immediately on startup
refreshStaleProfiles().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(`[RefreshWorker] Initial run failed: ${msg}`);
  void logError("refresh", "Initial refreshStaleProfiles failed", serializeError(err));
});

logger.info("🚀 RefreshWorker cron started (runs every hour)");
