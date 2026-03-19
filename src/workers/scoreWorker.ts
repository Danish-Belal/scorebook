import { Worker, Job } from "bullmq";
import { redisForBull } from "../config/redis";
import { scoreUser } from "../services/scoring";
import { ScoreJobData } from "./queues";
import { logger } from "../config/logger";

const worker = new Worker<ScoreJobData>(
  "compute-score",
  async (job: Job<ScoreJobData>) => {
    const { userId } = job.data;
    logger.info(`[ScoreWorker] Computing score for user ${userId}`);
    const finalScore = await scoreUser(userId);
    logger.info(`[ScoreWorker] ✅ User ${userId} scored: ${finalScore}`);
    return { finalScore };
  },
  {
    connection: redisForBull,
    concurrency: 3, // Score computation is heavier; keep low
  }
);

worker.on("completed", (job, result) => {
  logger.debug(`[ScoreWorker] Job ${job.id} completed with score ${result?.finalScore}`);
});

worker.on("failed", (job, err) => {
  logger.error(`[ScoreWorker] Job ${job?.id} failed: ${err.message}`);
});

logger.info("🚀 ScoreWorker started");

export { worker as scoreWorker };
