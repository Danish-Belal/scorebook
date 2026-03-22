# ScoreBook — Production & release checklist

Use this **before every production deploy** and **before merging large features**. Tick items in order; skip sections that don’t apply to your change.

**Repo layout:** backend at repo root (`src/`), frontend in `scorebook-frontend/`.

---

## How to use

| When | What to run |
|------|-------------|
| **Every PR / feature** | §1 Local quality + §2 Security quick pass (if you touched auth, env, or API) |
| **Before prod deploy** | All of §1–§6 + §8 |
| **After deploy** | §7 Smoke tests |

---

## 1 — Local quality (backend + frontend)

- [ ] **`npm run build`** at repo root — TypeScript compiles; **`dist/workers/`** contains `fetchWorker.js`, `scoreWorker.js`, `refreshWorker.js`, `snapshotWorker.js`.
- [ ] **`npm run test:unit`** — all tests green (or you’ve **documented** why expectations changed and updated tests in the same PR).
- [ ] **`cd scorebook-frontend && npm run build`** — Next.js production build succeeds; fix type/lint errors the build reports.
- [ ] No **`console.log`** left in hot paths unless intentional (prefer `logger` on API).

---

## 2 — Security & secrets

- [ ] **`.env` is not committed** — root `.gitignore` includes `.env`; frontend secrets only in `.env.local` (gitignored).
- [ ] **No secrets in source** — no real `JWT_SECRET`, OAuth secrets, or DB URLs hardcoded under `src/` or `scorebook-frontend/src/`.
- [ ] **JWT** — verification uses config from `src/config/env.ts` (`JWT_SECRET`), not a hardcoded fallback.
- [ ] **CORS** — `src/index.ts` uses **`env.FRONTEND_URL`** with credentials; never `"*"` for production browser clients.
- [ ] **Helmet** — remains **before** routes in `src/index.ts`.
- [ ] **Rate limits** — if you added new public or expensive routes, confirm they sit under `/api` (global limiter) or have an appropriate limiter (see `src/middleware/rateLimit.ts`).
- [ ] **User input** — new body/query params validated (e.g. Zod) before DB or Redis; URLs use `.url()` where stored or echoed.

---

## 3 — Environment configuration

- [ ] **Backend:** production values set for **`DATABASE_URL`**, **`REDIS_URL`**, **`JWT_SECRET`** (≥32 chars), **GitHub/Google OAuth** IDs and secrets, **`GITHUB_PAT`** if fetchers need it.
- [ ] **`FRONTEND_URL`** — exact origin users use (e.g. `https://app.yourdomain.com`), no trailing slash mismatch with browser.
- [ ] **`OAUTH_CALLBACK_BASE_URL`** — **API** public base URL (e.g. `https://api.yourdomain.com`). Must match **Google Cloud** and **GitHub OAuth App** redirect/callback URLs **character-for-character**.
- [ ] **`NODE_ENV=production`** on the API and workers (affects logging, cookies, cookie `secure`, etc.).
- [ ] **`.env.example`** updated if you added or renamed any variable required by `src/config/env.ts`.
- [ ] **Frontend:** **`NEXT_PUBLIC_API_URL`** in hosting (Vercel/etc.) points to the **production API** (not localhost).

---

## 4 — Database & data

- [ ] **Schema changes:** run **`npm run migrate`** (`drizzle-kit push`) against **staging first**, then production; confirm no errors.
- [ ] **Migrations / deploy order:** if the API expects new columns, deploy DB change **before** or **with** the code that writes them (avoid startup/write failures).
- [ ] **Backfills:** if the feature needs one-off data fixes, document the script or SQL and run it in a controlled window.
- [ ] **`scores_history`:** populated by **`scoreUser`** after scoring and by **`snapshotWorker`** (daily + on worker start). If you rely on history charts, ensure the **snapshot worker** runs in prod (see SETUP.md).

---

## 5 — Background workers & Redis (critical for ScoreBook)

Production needs **the API** plus **four long-running Node processes** (same env as API):

| Process | Start command (after `npm run build`) |
|---------|----------------------------------------|
| Fetch | `node dist/workers/fetchWorker.js` |
| Score | `node dist/workers/scoreWorker.js` |
| Refresh | `node dist/workers/refreshWorker.js` |
| Snapshot | `node dist/workers/snapshotWorker.js` |

- [ ] All four workers are defined in your host (e.g. Render background workers) with **`DATABASE_URL`** and **`REDIS_URL`** (and other vars from `.env.example` as needed).
- [ ] **Redis** is shared by API + all workers (BullMQ queues + leaderboard sorted sets).
- [ ] If you changed **queue names**, job payloads, or **job IDs**, plan for in-flight jobs or document a drain/redeploy strategy.

---

## 6 — API & contract (when you change endpoints or payloads)

- [ ] **Auth:** protected routes still use **`requireAuth`** (or equivalent); public routes (e.g. leaderboard) stay intentionally public.
- [ ] **Response shapes:** frontend (`scorebook-frontend/src/lib/api.ts` and pages) updated if JSON changed; avoid silent `undefined` crashes.
- [ ] **Error codes:** new validation failures return **4xx** with a clear message, not **500**, where appropriate.
- [ ] **`GET /health`** still returns **200** with a small JSON body (used by uptime monitors).

---

## 7 — Post-deploy smoke tests (5 minutes)

Run against **production** (replace URLs):

- [ ] **`GET /health`** → 200, `status: "ok"`.
- [ ] **`GET /api/scores/leaderboard`** without cookie → **200** (public).
- [ ] **`GET /api/scores/me`** without cookie → **401**.
- [ ] **Sign-in** (email or OAuth) end-to-end; dashboard loads.
- [ ] **Connect** one known profile URL → fetch worker logs show success → score updates (or queue status clears).
- [ ] Optional: **`npm run diagnose:score`** against prod Redis/DB from a trusted machine (uses `.env`).

---

## 8 — Operational hygiene (real world)

- [ ] **Uptime / health** — monitor `GET /health` (e.g. UptimeRobot, Better Stack).
- [ ] **Logs** — know where API/worker logs go on your host; errors also flow to **`error_logs`** table when using `logError` / workers.
- [ ] **Neon / Upstash limits** — connection and command limits fit expected traffic; upgrade tier before launch spikes if needed.
- [ ] **`npm audit`** — no unignored **critical** issues on dependencies you ship (fix or document acceptance).
- [ ] **Rollback plan** — previous Docker image / git tag / Render release to revert if needed.

---

## 9 — Feature-specific prompts (add your own)

When your PR touches…

| Area | Also verify |
|------|-------------|
| **Scoring** (`src/services/scoring/`) | Unit tests + spot-check a known profile (e.g. high-rated CF); **`scoreBreakdown`** JSON still valid for dashboard. |
| **Fetchers** | Timeouts and error handling; no unbounded retries hammering third-party APIs. |
| **New routes** | Rate limit, auth, Zod validation, and CORS preflight if called from browser. |
| **Frontend routing** | 401 handling doesn’t loop; loading/error states for new pages. |
| **Cookies / OAuth** | `secure`, `sameSite`, and domain match **HTTPS** and **`FRONTEND_URL`**. |

---

## Quick “not ready for prod” red flags

- CORS `*` with credentials, or `FRONTEND_URL` / OAuth URLs still pointing at **localhost**.
- Missing **snapshot** or **score** worker → stale or missing **`scores_history`** / Redis leaderboard vs DB drift.
- Deploying API **without** running **`migrate`** after schema changes.
- Shipping with **failing unit tests** and no written justification.

---

*Tailor §9 with links to your runbooks. Regenerate from the repo when architecture changes (new queues, new services, new env vars).*
