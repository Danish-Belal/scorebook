import Redis from "ioredis";
import type { ConnectionOptions } from "bullmq";
import { env } from "./env";

// Upstash Redis requires TLS — ioredis handles this automatically
// when the URL starts with rediss://
const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  lazyConnect:          true,
  // Upstash requires TLS
  tls: env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
};

export const redis = new Redis(env.REDIS_URL, redisOptions);

// BullMQ needs its own separate connection (same server; dedicated client)
export const redisForBull = new Redis(env.REDIS_URL, redisOptions);

/**
 * BullMQ bundles its own `ioredis` types, so the root package’s `Redis` instance
 * is not assignable to `ConnectionOptions` even though it works at runtime.
 */
export const bullRedisConnection = redisForBull as unknown as ConnectionOptions;

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error",   (err) => console.error("Redis error:", err.message));

export const LEADERBOARD_KEY = "scorebook:leaderboard:global";
export const platformLeaderboardKey = (p: string) => `scorebook:leaderboard:${p}`;
export const CACHE_TTL_SECONDS = 60 * 60 * 12;

export async function checkRedisConnection(): Promise<void> {
  await redis.connect();
  await redis.ping();
  console.log("✅ Redis ping OK");
}
