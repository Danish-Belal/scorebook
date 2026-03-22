/**
 * Quick HTTP checks against a running API (default http://localhost:3001).
 * Start the server first: npm run dev
 *
 *   API_BASE_URL=http://localhost:3001 npm run smoke:api
 */
const base = (process.env.API_BASE_URL || "http://localhost:3001").replace(/\/$/, "");

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`, e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  console.log(`Smoke API — ${base}\n`);

  await check("GET /auth/me → 401 when no cookie", async () => {
    const r = await fetch(`${base}/auth/me`);
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
  });

  await check("GET /api/scores/leaderboard → 200 JSON", async () => {
    const r = await fetch(`${base}/api/scores/leaderboard?page=1&limit=5`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { entries?: unknown[]; pagination?: unknown };
    if (!Array.isArray(j.entries)) throw new Error("missing entries array");
    if (!j.pagination) throw new Error("missing pagination");
  });

  await check("GET /api/scores/public/bad-segment → 400", async () => {
    const r = await fetch(`${base}/api/scores/public/!!`);
    if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  });

  if (process.exitCode === 1) {
    console.error("\nSome checks failed. Is the API running on this base URL?");
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
}

main();
