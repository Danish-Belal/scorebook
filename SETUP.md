# ScoreBook — Setup Guide

No Docker for the database. No local PostgreSQL. Just two free hosted services
and three commands.

---

## What you need

| What | Where | Time |
|---|---|---|
| Node.js 20+ | https://nodejs.org (LTS version) | 2 min |
| Neon account (free PostgreSQL) | https://neon.tech | 2 min |
| Upstash account (free Redis) | https://upstash.com | 2 min |
| GitHub OAuth App | https://github.com/settings/developers | 2 min |
| Google OAuth App | https://console.cloud.google.com | 3 min |

---

## Step 1 — Get your Neon database URL

1. Go to https://neon.tech → Sign up free
2. Click **New Project** → name it `scorebook` → Create
3. On the dashboard, click **Connection Details**
4. Select **Pooled connection** and framework **Node.js**
5. Copy the connection string — it looks like:
   ```
   postgresql://user:password@ep-xxxx.us-east-1.aws.neon.tech/scorebook?sslmode=require
   ```

---

## Step 2 — Get your Upstash Redis URL

1. Go to https://upstash.com → Sign up free
2. Click **Create Database** → name it `scorebook` → Region: closest to you → Create
3. On the database page, copy **UPSTASH_REDIS_URL** — it looks like:
   ```
   rediss://default:xxxxx@xxxx.upstash.io:6379
   ```

---

## Step 3 — Create your GitHub OAuth App

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - Application name: `ScoreBook Dev`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3001/auth/github/callback`
3. Click Register → copy **Client ID** and click **Generate a new client secret**

---

## Step 4 — Create your Google OAuth App

1. Go to https://console.cloud.google.com
2. Create a new project called `ScoreBook`
3. Go to **APIs & Services** → **OAuth consent screen** → choose **External** (dev) → add yourself as a **Test user** if the app stays in *Testing* (otherwise only test users can sign in).
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Web application** (not iOS/Android — those IDs cause **Error 401: invalid_client** with Passport).
6. Under **Authorized JavaScript origins**, add: `http://localhost:3001` (same host/port as your API — no path).
7. Under **Authorized redirect URIs**, add **exactly** (must match `OAUTH_CALLBACK_BASE_URL` in `.env`, no double slashes, `localhost` vs `127.0.0.1` must match):
   - `http://localhost:3001/auth/google/callback`
8. Copy **Client ID** and **Client Secret** into `.env` with **no spaces** or quotes. Regenerate the secret if you ever paste it wrong.

---

## Step 5 — Set up the project

```bash
# Clone / unzip the project
cd scorebook-v2

# Install dependencies
npm install

# Create your .env file
cp .env.example .env
```

Open `.env` and fill in:
- `DATABASE_URL` — from Neon (Step 1)
- `REDIS_URL` — from Upstash (Step 2)
- `JWT_SECRET` — generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` — from Step 3
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — from Step 4
- `OAUTH_CALLBACK_BASE_URL` — usually `http://localhost:3001` (API origin). Must match the **callback / redirect URLs** you registered on GitHub and Google **character-for-character** (scheme, host, port, path). Trailing slashes are stripped by the app, but do not rely on mismatched hosts (`localhost` ≠ `127.0.0.1`).

**Frontend (`scorebook-frontend/.env.local`):** copy `.env.local.example` → `.env.local` and set:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

OAuth buttons link to **`NEXT_PUBLIC_API_URL` + `/auth/github` or `/auth/google`**. If this points at the **Next.js port (3000)** or is unset incorrectly, the browser hits Next.js → **404 Page not found**. It must be the **Express API** base URL (default **3001**).

---

## Step 6 — Run the database migration

```bash
npm run migrate
```

This creates all 6 tables in your Neon database. You should see:

```
drizzle-kit: v0.21.x
Reading config file ...
[✓] Changes applied
```

That's it. No Docker. No local PostgreSQL. No password issues.

---

## Email & password (optional)

Users can also **sign up and sign in with email + password** from the frontend (`/signup`, `/login`). The API endpoints are:

- `POST /auth/register` — JSON `{ "email", "password" (min 8 chars), "displayName" }`
- `POST /auth/login` — JSON `{ "email", "password" }`

Both set the same `token` httpOnly cookie as GitHub/Google OAuth. OAuth-only accounts have no password; use **Sign in with GitHub/Google** for those.

After `npm run migrate`, the `users` table includes a nullable `password_hash` column.

---

## Run full stack in one terminal (local testing)

From the **repo root** (`scorebook-clean`), after `npm install` in the root **and** `npm install` inside `scorebook-frontend/`:

```bash
npm run dev:all
```

This starts together:

| Prefix | Service |
|--------|---------|
| `api` | Backend API → http://localhost:3001 |
| `fetch` | Fetch worker |
| `score` | Score worker |
| `refresh` | Refresh cron |
| `web` | Next.js frontend → http://localhost:3000 |

Press **Ctrl+C** once to stop all processes.

### Ports must be free: **3000** (Next.js) and **3001** (API)

If **3000** is taken, Next used to fall back to **3001** and then the **API could not start** (`EADDRINUSE`). You’d see **404** on `/api/...` and `/auth/...` because those requests hit Next.js instead of Express.

The frontend is pinned to **`-p 3000`**. Before `npm run dev:all`, stop old dev servers or free the ports (macOS/Linux):

```bash
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
lsof -ti tcp:3001 | xargs kill -9 2>/dev/null
```

Then run `npm run dev:all` again. You should see **`api`** listening on **3001** and **`web`** on **3000** (no “trying 3001 instead” for Next).

### How to tell everything is healthy

| Check | OK |
|--------|-----|
| `api` log | `🚀 ScoreBook v2 API → http://localhost:3001` (no `EADDRINUSE`) |
| `web` log | `Local: http://localhost:3000` |
| `fetch` / `score` / `refresh` | “started” lines, no crash loops |
| Browser | `curl http://localhost:3001/health` → JSON `status: ok` |
| Browser | Open `http://localhost:3000` — leaderboard preview loads (no 404 to `/api/...` in Network tab for calls to port **3001**) |

---

## OAuth troubleshooting (Google `invalid_client` / GitHub 404)

| Symptom | What to check |
|--------|----------------|
| **Google: Error 401 `invalid_client`** | Use a **Web application** OAuth client (not iOS/Android). **Client ID** and **Client Secret** must be from the **same** credential row in Google Cloud (no typos, no extra spaces — copy/paste again). If the secret was rotated, update `.env`. |
| **Google: still failing** | **OAuth consent screen**: app in *Testing* requires your Google account under **Test users**. **Redirect URI** in Google must equal `${OAUTH_CALLBACK_BASE_URL}/auth/google/callback` exactly (see API startup logs). |
| **GitHub / Google: 404 in browser** | **Wrong host:** OAuth URLs must hit the **API** (`http://localhost:3001/auth/...`), not Next (`3000`). Set `NEXT_PUBLIC_API_URL=http://localhost:3001` in `scorebook-frontend/.env.local` and restart Next. |
| **GitHub: redirect/callback errors** | GitHub OAuth App **Authorization callback URL** must be exactly `http://localhost:3001/auth/github/callback` (or your deployed API URL + `/auth/github/callback`). Not `/api/auth/...` — Express mounts auth at **`/auth`**, not under `/api`. |
| **Port clash** | If Next binds to **3001** instead of **3000**, the API cannot start and links break — see **Ports must be free** above. |

After changing `.env`, restart the **API** process. After changing `.env.local`, restart **Next.js**.

---

## Step 7 — Start the server

```bash
npm run dev
```

Expected output:
```
✅ Neon PostgreSQL connected
✅ Redis connected
✅ Redis ping OK
🚀 ScoreBook v2 API → http://localhost:3001
```

Test it:
```bash
curl http://localhost:3001/health
```

---

## Step 8 — Start the workers (3 new terminals)

```bash
npm run worker:fetch    # fetches platform data
npm run worker:score    # computes scores
npm run worker:refresh  # re-fetches stale data every 24h
```

---

## Step 9 — Run the tests

```bash
npm run test:unit
```

No database or Redis needed for unit tests — they test the scoring engine logic only.

---

## Stop everything (dev)

From another terminal (or after closing the `dev:all` tab):

```bash
npm run stop:all
```

This frees **3000** (Next.js) and **3001** (API) and tries to stop **fetch / score / refresh** workers started with `ts-node-dev` for **this repo folder**. If anything is still running, use **Activity Monitor** / `ps aux | grep ts-node` and kill manually.

On **Windows**, stop the `dev:all` terminal with **Ctrl+C**, then end stray `node.exe` tasks in Task Manager if needed.

---

## After login / opening dashboard

- **Successful login** (email or OAuth): the API **queues a fetch job for every linked platform** and **queues score calculation** in the background (same as **Re-sync all data**).
- **Dashboard** (first visit per browser tab): if you already had a session (no fresh login), it runs **one** automatic sync+score for that tab so bookmarks still refresh data.
- **Sign out** clears that one-per-tab flag so the next sign-in can trigger the flow again.

Wait **~1–3 minutes** after restart, then refresh the dashboard or use **Refresh score** if needed.

The dashboard **Score calculation** card calls **`GET /api/scores/queue-status`** only while platform fetches are **pending** or the score job is **in-flight** (waiting / active / etc.); polling **stops** when the job is **completed**, **failed**, or **idle** with no pending fetches. Manual **Refresh score** is rate-limited to **once every minute** per user (tune `refreshLimiter` in `src/middleware/rateLimit.ts` for production).

**`scores`** is upserted and **`scores_history`** gets a new row **each time the score worker finishes** (`scoreUser`), so the dashboard can load both from the DB after the queue completes. There is no separate snapshot cron required for history.

**Stuck “completed” score job:** BullMQ keeps the **`score-<userId>`** job document in Redis after completion. A new job with the same id cannot be added until that doc is removed. **`enqueueScore`** now **removes completed/failed** jobs before enqueueing, so **Refresh score / Score again** always schedules a fresh run. **`GET /api/scores/queue-status`** includes **`redisLeaderboard`** (`ZSCORE` on `scorebook:leaderboard:global`) so you can compare Redis vs Postgres.

---

## Debug: score not updating (Redis + DB)

Uses **`.env`** (`REDIS_URL` required; `DATABASE_URL` optional for per-user checks).

```bash
# Queue + global leaderboard summary
npm run diagnose:score

# Your user (Neon): profiles, platform_data, scores row, Redis rank
npm run diagnose:score -- --email=you@example.com
# or
npm run diagnose:score -- --user-id=<uuid-from-dashboard-or-db>
```

What to look for:

- **`scorebook:leaderboard:global`** has 0 members → no successful score job has written Redis yet.
- **BullMQ `fetch-platform-data` failed** → fix URL/username or API limits; then **Re-sync** on the dashboard.
- **BullMQ `compute-score` failed** → read the printed `failedReason`.
- **DB `platform_data` all `error`** → fetch never succeeded, so scoring has nothing to use.

---

## All commands

```bash
npm install              # install backend dependencies
cd scorebook-frontend && npm install && cd ..   # frontend deps (first time)
npm run migrate          # create database tables (run once)
npm run diagnose:score   # Redis queues + leaderboard (see section above)
npm run dev:all          # API + 3 workers + frontend (single terminal)
npm run stop:all         # kill ports 3000/3001 + this repo’s ts-node-dev workers (macOS/Linux)
npm run dev              # API only
npm run worker:fetch     # fetch worker only
npm run worker:score     # score worker only
npm run worker:refresh   # refresh cron only
npm run test:unit        # run scoring engine tests
npm run build            # compile TypeScript for production
```

---

## Testing the full flow

1. **Web UI:** `http://localhost:3000/signup` → create account → **Connect** (one URL or bulk lines).  
   Or **Sign in** with email at `/login`, or use GitHub/Google from those pages (redirects to dashboard when done).
2. **curl (optional):** copy the `token` cookie from DevTools, then connect a profile:
   ```bash
   curl -X POST http://localhost:3001/api/platforms/connect \
     -H "Content-Type: application/json" \
     -H "Cookie: token=YOUR_JWT" \
     -d '{"profileUrl": "https://codeforces.com/profile/tourist"}'
   ```
3. Wait ~10 seconds, then check your score:
   ```bash
   curl http://localhost:3001/api/scores/me \
     -H "Cookie: token=YOUR_JWT"
   ```
