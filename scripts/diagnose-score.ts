/**
 * ScoreBook — diagnose why a score might be missing.
 *
 * Uses .env from project root (REDIS_URL required; DATABASE_URL optional but recommended).
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/diagnose-score.ts
 *   npx ts-node --transpile-only scripts/diagnose-score.ts --email=you@example.com
 *   npx ts-node --transpile-only scripts/diagnose-score.ts --user-id=<uuid>
 *
 * npm:
 *   npm run diagnose:score
 *   npm run diagnose:score -- --email=you@example.com
 */

import { config } from "dotenv";
import { resolve } from "path";
import Redis from "ioredis";
import { Queue } from "bullmq";

// Load .env from repo root (parent of scripts/)
config({ path: resolve(__dirname, "..", ".env") });

const LEADERBOARD_KEY = "scorebook:leaderboard:global";
const platformLeaderboardKey = (p: string) => `scorebook:leaderboard:${p}`;

function parseArgs(): { email?: string; userId?: string } {
  const out: { email?: string; userId?: string } = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--email=")) out.email = a.slice("--email=".length).trim();
    if (a.startsWith("--user-id=")) out.userId = a.slice("--user-id=".length).trim();
  }
  if (!out.email && process.env.DIAGNOSE_EMAIL) out.email = process.env.DIAGNOSE_EMAIL.trim();
  if (!out.userId && process.env.DIAGNOSE_USER_ID) out.userId = process.env.DIAGNOSE_USER_ID.trim();
  return out;
}

function redisOpts(url: string) {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    connectTimeout: 15_000,
    commandTimeout: 30_000,
    tls: url.startsWith("rediss://") ? ({} as object) : undefined,
  };
}

async function main() {
  const { email, userId: userIdArg } = parseArgs();
  const redisUrl = process.env.REDIS_URL;

  console.log("\n════════ ScoreBook score diagnostic ════════\n");

  if (!redisUrl) {
    console.error("❌ REDIS_URL missing in .env\n");
    process.exit(1);
  }

  // One connection for ZSET checks + BullMQ (Queue.close() won’t quit a shared client)
  const redis = new Redis(redisUrl, redisOpts(redisUrl));

  try {
    await redis.ping();
    console.log("✅ Redis PING ok\n");
  } catch (e) {
    console.error("❌ Redis connection failed:", e);
    process.exit(1);
  }

  // ── Global leaderboard (sorted set) ─────────────────────────────
  const totalRanked = await redis.zcard(LEADERBOARD_KEY);
  console.log("── Global leaderboard (Redis) ──");
  console.log(`   Key: ${LEADERBOARD_KEY}`);
  console.log(`   Members (users with a stored score): ${totalRanked}`);

  if (totalRanked > 0) {
    const top = await redis.zrevrange(LEADERBOARD_KEY, 0, 4, "WITHSCORES");
    console.log("   Top 5 (member → score):");
    for (let i = 0; i < top.length; i += 2) {
      console.log(`     ${top[i]} → ${top[i + 1]}`);
    }
  } else {
    console.log("   ⚠️  Nobody is in the global leaderboard yet.");
    console.log("      Usually means no score job has completed successfully, or all scores failed before zadd.\n");
  }

  // ── BullMQ queues (same names as app) ─────────────────────────
  // BullMQ bundles its own ioredis types; root ioredis instance is compatible at runtime.
  const fetchQueue = new Queue("fetch-platform-data", { connection: redis as never });
  const scoreQueue = new Queue("compute-score", { connection: redis as never });

  console.log("\n── BullMQ: fetch-platform-data ──");
  const fc = await fetchQueue.getJobCounts();
  console.log("   Counts:", JSON.stringify(fc, null, 2));
  const fetchFailed = await fetchQueue.getJobs(["failed"], 0, 8);
  if (fetchFailed.length) {
    console.log("   Recent failed jobs (up to 8):");
    for (const j of fetchFailed) {
      const reason = j.failedReason?.slice(0, 200) ?? "(no reason)";
      console.log(`     id=${j.id} userId=${(j.data as { userId?: string })?.userId} → ${reason}`);
    }
  }

  console.log("\n── BullMQ: compute-score ──");
  const sc = await scoreQueue.getJobCounts();
  console.log("   Counts:", JSON.stringify(sc, null, 2));
  const scoreWaiting = await scoreQueue.getJobs(["waiting", "delayed", "active"], 0, 15);
  if (scoreWaiting.length) {
    console.log("   Waiting / delayed / active (up to 15):");
    for (const j of scoreWaiting) {
      const d = j.data as { userId?: string };
      const delay = (j as { delay?: number }).delay;
      console.log(`     id=${j.id} userId=${d?.userId} state=${await j.getState()} delayMs=${delay ?? 0}`);
    }
  }
  const scoreFailed = await scoreQueue.getJobs(["failed"], 0, 8);
  if (scoreFailed.length) {
    console.log("   Recent failed score jobs:");
    for (const j of scoreFailed) {
      const d = j.data as { userId?: string };
      const reason = j.failedReason?.slice(0, 300) ?? "(no reason)";
      console.log(`     id=${j.id} userId=${d?.userId} → ${reason}`);
    }
  }

  await fetchQueue.close();
  await scoreQueue.close();

  // ── Optional: DB + per-user Redis ─────────────────────────────
  const dbUrl = process.env.DATABASE_URL;
  let userId = userIdArg;

  if (dbUrl && (email || userId)) {
    console.log("\n── Database (Neon) ──");
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(dbUrl);

    if (!userId && email) {
      const rows = await sql`
        SELECT id, email, display_name FROM users WHERE lower(email) = lower(${email}) LIMIT 1
      `;
      if (!rows.length) {
        console.log(`   ❌ No user with email: ${email}`);
      } else {
        const r = rows[0] as { id: string; email: string | null; display_name: string };
        userId = r.id;
        console.log(`   User: ${r.display_name} <${r.email}>  id=${userId}`);
      }
    } else if (userId) {
      const rows = await sql`SELECT id, email, display_name FROM users WHERE id = ${userId} LIMIT 1`;
      if (!rows.length) {
        console.log(`   ❌ No user with id: ${userId}`);
        userId = undefined;
      } else {
        const r = rows[0] as { id: string; email: string | null; display_name: string };
        console.log(`   User: ${r.display_name} <${r.email}>  id=${userId}`);
      }
    }

    if (userId) {
      const profiles = await sql`
        SELECT platform, profile_url, username, last_fetched_at
        FROM platform_profiles WHERE user_id = ${userId}
      `;
      console.log(`   platform_profiles: ${profiles.length} row(s)`);
      for (const p of profiles as { platform: string; profile_url: string; username: string | null }[]) {
        console.log(`     • ${p.platform}  username=${p.username ?? "?"}  ${p.profile_url}`);
      }

      const pdata = await sql`
        SELECT platform, fetch_status, error_message,
               (raw_data IS NOT NULL) AS has_raw
        FROM platform_data WHERE user_id = ${userId}
      `;
      console.log(`   platform_data: ${pdata.length} row(s)`);
      for (const r of pdata as {
        platform: string;
        fetch_status: string;
        error_message: string | null;
        has_raw: boolean;
      }[]) {
        const err = r.error_message ? ` err="${r.error_message.slice(0, 120)}"` : "";
        console.log(`     • ${r.platform}  status=${r.fetch_status}  has_raw=${r.has_raw}${err}`);
      }

      const scoreRows = await sql`
        SELECT composite_score, computed_at
        FROM scores WHERE user_id = ${userId} LIMIT 1
      `;
      if (!scoreRows.length) {
        console.log("   scores: ❌ no row (score worker never persisted)");
      } else {
        const s = scoreRows[0] as { composite_score: string; computed_at: string };
        console.log(`   scores: composite=${s.composite_score}  computed_at=${s.computed_at}`);
      }

      const rank0 = await redis.zrevrank(LEADERBOARD_KEY, userId);
      const zscore = await redis.zscore(LEADERBOARD_KEY, userId);
      console.log("\n── Your user in Redis global leaderboard ──");
      if (rank0 === null) {
        console.log(`   ❌ Not in ${LEADERBOARD_KEY}`);
        console.log("      → scoreUser() exits early without zadd if no platform_data with fetch_status=success + parseable metrics.");
        console.log("      → Or score job never ran / failed (see BullMQ failed above).");
      } else {
        console.log(`   Rank: #${rank0 + 1}   score: ${zscore}`);
      }

      const platforms = ["codeforces", "leetcode", "github", "codechef", "atcoder"];
      console.log("\n── Per-platform Redis leaderboards (sample) ──");
      for (const p of platforms) {
        const key = platformLeaderboardKey(p);
        const mem = await redis.zscore(key, userId);
        if (mem !== null) console.log(`   ${key}: ${mem}`);
      }
    }
  } else if (!dbUrl) {
    console.log("\n── Database ──");
    console.log("   (skipped — set DATABASE_URL in .env and pass --email= or --user-id= for user-specific checks)");
  } else {
    console.log("\n── Database ──");
    console.log("   (skipped — pass --email=you@... or --user-id=<uuid> for user-specific checks)");
  }

  // ── Hints ─────────────────────────────────────────────────────
  console.log("\n── What usually fixes “no score” ──");
  console.log("   1. Workers running: npm run dev:all (or worker:fetch + worker:score)");
  console.log("   2. platform_data.fetch_status = success for at least one platform");
  console.log("   3. No failed jobs in compute-score / fetch-platform-data");
  console.log("   4. After queue bugs, use dashboard “Re-sync all data” or POST /api/platforms/sync");
  console.log("");

  await redis.quit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
