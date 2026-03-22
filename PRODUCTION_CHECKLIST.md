# ScoreBook — Production Readiness Checklist
# Give this entire file to Cursor and say: "Work through every item in this checklist"
# Cursor should check, fix, and mark each item ✅ or ❌ with notes

---

## HOW TO USE THIS WITH CURSOR

Open this file in Cursor. Say:
"Work through every item in this checklist top to bottom.
For each item: check if the issue exists, fix it if it does,
then mark it ✅ PASS or ❌ FIXED (with a note of what you changed).
Do not skip any item."

---

## SECTION 1 — BUILD VERIFICATION
### Goal: Both projects compile with zero errors

- [ ] **BE-BUILD-1** Run `cd scorebook-v2 && npx tsc --noEmit` — fix every TypeScript error before continuing
- [ ] **BE-BUILD-2** Run `cd scorebook-v2 && npm run test:unit` — all tests must pass
- [ ] **FE-BUILD-1** Run `cd scorebook-frontend && npx tsc --noEmit` — fix every TypeScript error
- [ ] **FE-BUILD-2** Run `cd scorebook-frontend && npm run build` — production build must succeed with no errors
- [ ] **FE-BUILD-3** Check that `npm run build` output shows no "Missing key" or "useEffect has missing deps" warnings

---

## SECTION 2 — DEAD CODE REMOVAL
### Goal: No unused variables, imports, or functions

- [ ] **DC-1** In `scorebook-v2/src/workers/fetchWorker.ts` — `CONCURRENCY_MAP` is defined but never used. Delete it.
- [ ] **DC-2** In `scorebook-v2/src/services/scoring/composite.ts` — `scores` parameter in `computeTitles()` and `computePotential()` is declared but never read. Remove it from function signatures.
- [ ] **DC-3** In `scorebook-v2/src/workers/queues.ts` — `snapshotQueue` and `SnapshotJobData` are defined but never used anywhere. Remove both.
- [ ] **DC-4** Run `npx tsc --noEmit` again after DC-1 through DC-3 to confirm no new errors introduced.

---

## SECTION 3 — TYPE SAFETY
### Goal: No unsafe `as any` casts that could hide runtime errors

- [ ] **TS-1** In `scorebook-v2/src/workers/fetchWorker.ts` line with `.onConflictDoUpdate({ ... } as any)` — replace `as any` with proper typed target array: `target: [platformData.userId, platformData.platform]`
- [ ] **TS-2** In `scorebook-v2/src/routes/platforms.ts` — the `.onConflictDoUpdate({ target: [...] as any })` pattern. Replace with `target: sql\`(user_id, platform)\`` or use the correct Drizzle composite unique index reference.
- [ ] **TS-3** In `scorebook-v2/src/services/scoring/index.ts` — `platformRanks` typed as `Partial<Record<any, ...>>`. Change `any` to `PlatformName`.
- [ ] **TS-4** In `scorebook-v2/src/services/scoring/index.ts` — `scoreBreakdown: result.platformScores as any` — change to `scoreBreakdown: result.platformScores as unknown as Record<string, unknown>`.

---

## SECTION 4 — SECURITY
### Goal: No secrets in code, no open attack surfaces

- [ ] **SEC-1** Verify `.env` is in `.gitignore` for BOTH `scorebook-v2` and `scorebook-frontend`. If not, add it.
- [ ] **SEC-2** Verify `scorebook-v2/.gitignore` exists and contains: `node_modules/`, `dist/`, `.env`, `*.log`
- [ ] **SEC-3** Run `grep -r "scorebook_dev_pass\|your_github_client\|JWT_SECRET" scorebook-v2/src/` — must return ZERO results. Any hardcoded secret is a critical failure.
- [ ] **SEC-4** In `scorebook-v2/src/middleware/auth.ts` — confirm JWT verification uses `env.JWT_SECRET` not a fallback string literal.
- [ ] **SEC-5** In `scorebook-v2/src/index.ts` — confirm CORS `origin` is `env.FRONTEND_URL` not `"*"`. Wildcard CORS in production allows any site to make authenticated requests.
- [ ] **SEC-6** In `scorebook-v2/src/middleware/rateLimit.ts` — confirm `authLimiter` is applied to `/auth/github` and `/auth/google` routes. Brute-force protection on OAuth endpoints.
- [ ] **SEC-7** Confirm `helmet()` is called in `scorebook-v2/src/index.ts` before any routes — sets security headers (XSS, clickjacking, etc.).
- [ ] **SEC-8** In `scorebook-v2/src/routes/platforms.ts` — the `profileUrl` field is saved to DB. Confirm Zod validates it as `.url()` before insertion to prevent XSS via malicious URLs.

---

## SECTION 5 — ERROR HANDLING
### Goal: Every async operation has a catch, no unhandled promise rejections

- [ ] **ERR-1** In `scorebook-v2/src/workers/refreshWorker.ts` — the `refreshStaleProfiles()` call at startup has `.catch()`. Confirm it does not crash the process on startup failure.
- [ ] **ERR-2** In `scorebook-v2/src/services/fetchers/atcoder.ts` — the history page scrape has a try/catch. Confirm the main profile fetch also has error handling for network timeouts (axios timeout is set to 15000ms — confirm this exists).
- [ ] **ERR-3** In `scorebook-v2/src/services/fetchers/gfg.ts` — scrape fallback exists. Confirm both the API call and the scrape fallback have timeouts set.
- [ ] **ERR-4** In `scorebook-frontend/src/app/dashboard/page.tsx` — the `Promise.all` fetching score+platforms has `.catch(() => router.push("/"))`. Confirm this doesn't cause infinite redirect loops if the user IS authenticated but score fetch fails.
- [ ] **ERR-5** In all frontend API calls — confirm `ApiError` with status 401 redirects to `/` (not a crash). Add a global interceptor or check in each page that catches 401 and calls `router.push("/")`.

---

## SECTION 6 — PERFORMANCE
### Goal: No N+1 queries, no blocking operations

- [ ] **PERF-1** In `scorebook-v2/src/services/scoring/index.ts` — the loop `for (const p of PS_PLATFORMS) { await redis.zrevrank(...) }` makes 5 sequential Redis calls. Replace with `Promise.all([...PS_PLATFORMS.map(p => redis.zrevrank(...))])` — parallel, not sequential.
- [ ] **PERF-2** In `scorebook-v2/src/services/scoring/index.ts` — the loop `for (const pd of result.platformScores) { await db.insert(platformSpotlights)... }` makes up to 9 sequential DB writes. Replace with a single `Promise.all([...])`.
- [ ] **PERF-3** In `scorebook-v2/src/services/leaderboard.ts` — `getLeaderboard` makes 2 sequential DB queries (users then scores). These are already using `Promise.all` — confirm this is the case.
- [ ] **PERF-4** In `scorebook-frontend/src/app/dashboard/page.tsx` — score+platforms fetched with `Promise.all` — confirm this is parallel, not sequential.

---

## SECTION 7 — ENVIRONMENT CONFIGURATION
### Goal: Zero hardcoded values that differ between dev and prod

- [ ] **ENV-1** Confirm `scorebook-v2/.env.example` has ALL variables that `src/config/env.ts` requires. Missing variables will crash the server on startup in production.
- [ ] **ENV-2** In `scorebook-frontend` — confirm `.env.local.example` exists with `NEXT_PUBLIC_API_URL=http://localhost:3001`
- [ ] **ENV-3** In `scorebook-frontend/src/app/page.tsx` and `src/components/layout/Navbar.tsx` — confirm they use `process.env.NEXT_PUBLIC_API_URL` via the `BASE_URL` import from `@/lib/api`, NOT any hardcoded `http://localhost:3001` string.
- [ ] **ENV-4** Run `grep -r "localhost:3001" scorebook-frontend/src/` — must return ZERO results. Every reference to the backend URL must go through `BASE_URL` from `@/lib/api`.

---

## SECTION 8 — DATABASE
### Goal: Schema is complete, indexes are correct, migrations run clean

- [ ] **DB-1** Run `npm run migrate` on a fresh Neon branch — confirm it succeeds with zero errors.
- [ ] **DB-2** In `scorebook-v2/src/models/schema.ts` — confirm all foreign key references use `ON DELETE CASCADE` where appropriate (platform_profiles, platform_data, scores all reference users — if a user is deleted, all their data should be deleted too).
- [ ] **DB-3** Confirm the `scores_history` table is being populated. Check that `scoresHistory` insert exists somewhere — currently there is NO code that writes to `scores_history`. This needs a cron job. Add a daily snapshot: after `scoreUser()` completes, insert a row into `scores_history`.
- [ ] **DB-4** In `scorebook-v2/src/services/scoring/index.ts` — after computing score, add this insert:
  ```typescript
  await db.insert(scoresHistory).values({
    userId,
    compositeScore: String(result.finalScore),
    rank: rank0 !== null ? rank0 + 1 : null,
    totalUsers: await redis.zcard(LEADERBOARD_KEY),
  });
  ```
- [ ] **DB-5** Confirm that `platform_data` rows older than 30 days for inactive users are cleaned up. Add a monthly cleanup job or Neon scheduled query to `DELETE FROM platform_data WHERE fetched_at < NOW() - INTERVAL '30 days' AND fetch_status = 'error'`.

---

## SECTION 9 — API CORRECTNESS
### Goal: All API endpoints return the correct shape, auth is enforced

- [ ] **API-1** Test `GET /health` — must return `{ status: "ok" }` with 200. If this fails, the server is down.
- [ ] **API-2** Test `GET /api/scores/leaderboard` WITHOUT a JWT cookie — must return 200 (public endpoint). If it returns 401, the auth middleware is incorrectly applied.
- [ ] **API-3** Test `GET /api/scores/me` WITHOUT a JWT cookie — must return 401. If it returns 200 or 500, auth is broken.
- [ ] **API-4** Test `POST /api/platforms/connect` with an invalid URL like `"not-a-url"` — must return 400 with a validation error, not 500.
- [ ] **API-5** Test `POST /api/platforms/connect` with a valid URL for an unknown platform like `"https://example.com/user/test"` — must return 400 "could not detect platform", not 500.
- [ ] **API-6** In `scorebook-v2/src/routes/scores.ts` — the `/scores/me` endpoint — confirm it handles the case where `scoreRow` exists but `scoreBreakdown` is null (new user with platforms connecting but score not yet computed). It should return the partial data, not crash.

---

## SECTION 10 — FRONTEND UX
### Goal: Every loading state, error state, and empty state is handled

- [ ] **UX-1** In `scorebook-frontend/src/app/dashboard/page.tsx` — confirm there is a loading skeleton shown while data fetches. (Already implemented — verify it renders correctly.)
- [ ] **UX-2** In `scorebook-frontend/src/app/leaderboard/page.tsx` — if `entries` is empty (zero users), show a "No developers ranked yet" message instead of an empty table.
- [ ] **UX-3** In `scorebook-frontend/src/app/connect/page.tsx` — after successfully connecting, the `router.push("/dashboard")` fires after 2 seconds. Add a visible countdown or "Taking you to dashboard..." message so the user knows something is happening.
- [ ] **UX-4** In `scorebook-frontend/src/components/layout/Navbar.tsx` — if `authApi.getMe()` fails with a non-401 error (network down), do not show a broken state. Show "Sign in" button as fallback.
- [ ] **UX-5** Confirm that all `<img>` tags for avatars have an `onError` fallback that shows the initials avatar instead of a broken image icon.

---

## SECTION 11 — PRE-DEPLOY FINAL CHECKS

- [ ] **DEPLOY-1** `npm run build` on frontend succeeds — check output for bundle size. If any chunk exceeds 500KB, investigate.
- [ ] **DEPLOY-2** Run `npm audit` on both projects — fix any **high** or **critical** vulnerabilities. Moderate is acceptable.
- [ ] **DEPLOY-3** Confirm `NODE_ENV=production` is set in your production environment. Several features (secure cookies, JSON logging, CORS strictness) only activate in production mode.
- [ ] **DEPLOY-4** Confirm production `FRONTEND_URL` in backend `.env` is your real domain (e.g. `https://scorebook.app`), NOT `http://localhost:3000`. OAuth cookies will not work cross-domain otherwise.
- [ ] **DEPLOY-5** Confirm production `OAUTH_CALLBACK_BASE_URL` in backend `.env` is your real API domain. GitHub and Google OAuth app redirect URIs must also be updated to match.
- [ ] **DEPLOY-6** Confirm Neon database is NOT the free tier branch if you expect traffic. Free tier has connection limits.
- [ ] **DEPLOY-7** Confirm Upstash Redis is NOT the free tier if you expect >10K commands/day.
- [ ] **DEPLOY-8** Set up health check monitoring — point a service like UptimeRobot (free) to `https://your-api.com/health`. Get alerted if the server goes down.

---

## SECTION 12 — SCORING ENGINE INTEGRITY

- [ ] **SCORE-1** Run the unit tests: `cd scorebook-v2 && npm run test:unit` — ALL tests must pass before deploying.
- [ ] **SCORE-2** Manually verify: connect `https://codeforces.com/profile/tourist` (world's highest-rated CF user). After score computes, their CF sub-score should be close to 100. If it's below 80, the scoring engine has a bug.
- [ ] **SCORE-3** Verify that a brand-new user with no platforms gets `compositeScore: 0` from `GET /api/scores/me`, not an error.
- [ ] **SCORE-4** Verify that after `POST /api/scores/refresh`, the fetch and score workers actually process the job. Check worker terminal logs for `[FetchWorker] ✅ Fetched` and `[ScoreWorker] ✅ User ... scored`.

---

## WHAT TO FIX IMMEDIATELY (Critical before prod)

These are the items that WILL cause failures in production if not fixed:

1. **DB-3 + DB-4** — `scores_history` is never populated. The dashboard history chart will always be empty.
2. **PERF-1** — Sequential Redis calls in scoring. At 100+ users, score computation will be slow.
3. **ENV-3 + ENV-4** — Any hardcoded `localhost` in the frontend breaks in production.
4. **SEC-5** — CORS wildcard would be a security vulnerability.
5. **DEPLOY-4 + DEPLOY-5** — Wrong URLs in production .env will break ALL OAuth logins.

---

## WHAT CAN WAIT (Non-critical, fix post-launch)

- DC-2, DC-3 (dead code — harmless but messy)
- TS-1 through TS-4 (type safety — won't crash but hides potential bugs)
- DB-5 (cleanup job — only needed after months of data accumulation)
- UX-2, UX-3, UX-5 (minor UX polish)

---
*Generated for ScoreBook v4 backend + Next.js 14 frontend*
*Run through this checklist with Cursor before every major deploy*
