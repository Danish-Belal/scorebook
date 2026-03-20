import { Queue } from "bullmq";
import { bullRedisConnection } from "../config/redis";

const connection = { connection: bullRedisConnection };

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

/** BullMQ rejects jobId values containing ":" — use separators like "-". */
function fetchJobId(userId: string, platform: string): string {
  return `fetch-${platform}-${userId}`;
}

function scoreJobId(userId: string): string {
  return `score-${userId}`;
}

export async function enqueueFetch(
  userId: string,
  platform: string,
  username: string
): Promise<void> {
  await fetchQueue.add(
    fetchJobId(userId, platform),
    { userId, platform, username },
    { jobId: fetchJobId(userId, platform) } // dedupe same user+platform
  );
}

export async function enqueueScore(userId: string): Promise<void> {
  const id = scoreJobId(userId);
  const existing = await scoreQueue.getJob(id);
  if (existing) {
    const state = (await existing.getState()) as string;
    // Same jobId cannot be re-added while a completed/failed job doc still exists in Redis — user stays "stuck" on the dashboard.
    if (state === "completed" || state === "failed") {
      await existing.remove();
    } else if (
      state === "waiting" ||
      state === "delayed" ||
      state === "active" ||
      state === "paused" ||
      state === "waiting-children"
    ) {
      return; // already queued / running
    }
  }
  await scoreQueue.add(
    id,
    { userId },
    {
      jobId: id,
      delay: 2000, // let concurrent fetches finish before scoring
    }
  );
}
