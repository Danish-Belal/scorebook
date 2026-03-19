import { Queue } from "bullmq";
import { redisForBull } from "../config/redis";

const connection = { connection: redisForBull };

// Queue: fetch platform data for one user + one platform
export const fetchQueue = new Queue<FetchJobData>("fetch-platform-data", {
  ...connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// Queue: compute score for a user (triggered after successful fetch)
export const scoreQueue = new Queue<ScoreJobData>("compute-score", {
  ...connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// Queue: daily snapshot of scores for history charts
export const snapshotQueue = new Queue<SnapshotJobData>("score-snapshot", {
  ...connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 20 },
  },
});

// ─── Job Data Types ───────────────────────────────────────────────────────────

export interface FetchJobData {
  userId:   string;
  platform: string;
  username: string;
}

export interface ScoreJobData {
  userId: string;
}

export interface SnapshotJobData {
  userId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function enqueueFetch(
  userId: string,
  platform: string,
  username: string
): Promise<void> {
  await fetchQueue.add(
    `fetch:${platform}:${userId}`,
    { userId, platform, username },
    { jobId: `fetch:${platform}:${userId}` } // Deduplicate
  );
}

export async function enqueueScore(userId: string): Promise<void> {
  await scoreQueue.add(
    `score:${userId}`,
    { userId },
    {
      jobId:  `score:${userId}`,
      delay:  2000, // Small delay to allow multiple fetches to complete first
    }
  );
}
