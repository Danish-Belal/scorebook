import { scoreQueue } from "../workers/queues";

/** BullMQ queue name in `queues.ts` — compute composite score + Redis leaderboard */
export const SCORE_COMPUTE_QUEUE_NAME = "compute-score";

export type ScoreJobBullmqState =
  | "idle"
  | "waiting"
  | "delayed"
  | "active"
  | "completed"
  | "failed"
  | "paused"
  | "unknown";

export interface ScoreQueueJobStatus {
  queueName: string;
  jobId: string;
  bullmqState: ScoreJobBullmqState;
  /** When no Redis job doc exists */
  hint?: string;
  failedReason?: string;
  /** Worker return value when completed (while job still in Redis) */
  resultFinalScore?: number;
  finishedOn?: number | null;
  attemptsMade?: number;
}

/**
 * Inspect the deduped score job (`score-<userId>`) in Redis via BullMQ.
 * Completed jobs disappear after `removeOnComplete` trim → state becomes `idle` even though DB is updated.
 */
export async function getScoreQueueJobStatus(userId: string): Promise<ScoreQueueJobStatus> {
  const jobId = `score-${userId}`;
  const job = await scoreQueue.getJob(jobId);

  if (!job) {
    return {
      queueName: SCORE_COMPUTE_QUEUE_NAME,
      jobId,
      bullmqState: "idle",
      hint:
        "No score job in Redis right now — either not queued yet, or it finished and was removed from the queue (check your score below).",
    };
  }

  const rawState = await job.getState();
  const bullmqState = normalizeState(rawState);

  const base: ScoreQueueJobStatus = {
    queueName: SCORE_COMPUTE_QUEUE_NAME,
    jobId,
    bullmqState,
    attemptsMade: job.attemptsMade,
  };

  if (bullmqState === "failed") {
    return {
      ...base,
      failedReason: job.failedReason ?? "Score worker failed without a message.",
    };
  }

  if (bullmqState === "completed") {
    const rv = job.returnvalue as { finalScore?: number } | undefined;
    return {
      ...base,
      resultFinalScore: rv?.finalScore,
      finishedOn: job.finishedOn ?? null,
    };
  }

  return base;
}

function normalizeState(s: string): ScoreJobBullmqState {
  switch (s) {
    case "waiting":
    case "delayed":
    case "active":
    case "completed":
    case "failed":
    case "paused":
      return s;
    case "waiting-children":
      return "waiting";
    default:
      return "unknown";
  }
}
