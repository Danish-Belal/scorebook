import cron from "node-cron";
import { db } from "../config/database";
import { scores, scoresHistory } from "../models/schema";
import { redis, LEADERBOARD_KEY } from "../config/redis";
import { logger } from "../config/logger";

const INSERT_CHUNK = 200;

async function runDailySnapshot(): Promise<void> {
  const started = Date.now();
  try {
    const allScores = await db
      .select({
        userId: scores.userId,
        compositeScore: scores.compositeScore,
      })
      .from(scores);

    if (allScores.length === 0) {
      logger.info("[SnapshotWorker] No scores rows — skipping snapshot");
      return;
    }

    const totalUsers = await redis.zcard(LEADERBOARD_KEY);

    const pipeline = redis.pipeline();
    for (const row of allScores) {
      pipeline.zrevrank(LEADERBOARD_KEY, row.userId);
    }
    const rankResults = await pipeline.exec();

    const snapshotDate = new Date();
    const values = allScores.map((row, i) => {
      const tuple = rankResults?.[i];
      let rank1Based: number | null = null;
      if (tuple && !tuple[0]) {
        const rank0 = tuple[1] as number | null;
        rank1Based = rank0 !== null && rank0 !== undefined ? rank0 + 1 : null;
      }

      return {
        userId: row.userId,
        compositeScore: String(row.compositeScore),
        rank: rank1Based,
        totalUsers,
        snapshotDate,
      };
    });

    for (let i = 0; i < values.length; i += INSERT_CHUNK) {
      await db.insert(scoresHistory).values(values.slice(i, i + INSERT_CHUNK));
    }

    logger.info(
      `[SnapshotWorker] Snapshot complete users=${values.length} totalOnBoard=${totalUsers} ms=${Date.now() - started}`
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[SnapshotWorker] Snapshot failed: ${msg}`);
  }
}

cron.schedule("0 0 * * *", () => {
  void runDailySnapshot();
});

void runDailySnapshot();

logger.info("[SnapshotWorker] Started — daily midnight cron (0 0 * * *) + initial snapshot");
