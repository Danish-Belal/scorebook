import { Worker, Job } from "bullmq";
import { bullRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { scoreUser } from "../services/scoring";
import { ScoreJobData } from "./queues";
import { logger } from "../config/logger";
import { logError, logInfo, serializeError } from "../services/errorLogger";

const worker = new Worker<ScoreJobData>(
  "compute-score",
  async (job: Job<ScoreJobData>) => {
    const { userId } = job.data;
    if (env.NODE_ENV !== "production") {
      logger.info(`[ScoreWorker] Computing score for user ${userId}`);
    }
    try {
      const { finalScore, response } = await scoreUser(userId);
      const summary = { userId, jobId: job.id, finalScore };
      if (env.NODE_ENV === "production") {
        logger.info(
          `[ScoreWorker] completed userId=${userId} jobId=${job.id} finalScore=${finalScore}`
        );
        void logInfo(
          "score",
          `Score job completed userId=${userId} finalScore=${finalScore}`,
          summary,
          userId
        );
      } else {
        logger.info(`[ScoreWorker] RESULT ${JSON.stringify({ ...summary, response })}`);
        void logInfo(
          "score",
          `Score job completed userId=${userId} finalScore=${finalScore}`,
          { ...summary, response },
          userId
        );
      }
      return { finalScore };
    } catch (err) {
      void logError(
        "score",
        `Score computation failed for user ${userId}`,
        { ...serializeError(err), jobId: job.id },
        userId
      );
      throw err;
    }
  },
  {
    connection: bullRedisConnection,
    concurrency: 3, // Score computation is heavier; keep low
  }
);

worker.on("completed", (job, result) => {
  if (env.NODE_ENV === "production") return;
  const uid = job.data?.userId;
  logger.info(
    `[ScoreWorker] Job ${job.id} completed userId=${uid ?? "?"} finalScore=${result?.finalScore}`
  );
});

worker.on("failed", (job, err) => {
  logger.error(`[ScoreWorker] Job ${job?.id} failed: ${err.message}`);
  const userId = job?.data?.userId;
  void logError(
    "score",
    `Score job permanently failed: ${job?.id}`,
    { ...serializeError(err), jobId: job?.id, userId },
    userId
  );
});

if (env.NODE_ENV !== "production") {
  logger.info("🚀 ScoreWorker started");
}

export { worker as scoreWorker };
