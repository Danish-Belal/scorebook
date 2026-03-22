# ScoreBook — Deploying backend + frontend

This guide is for **early production** (few users): one API, one Next.js app, Neon + Upstash, and **four worker processes**. For local development you still use `npm run dev:all` from the repo root.

---

## 1. Production logging & what users see

With **`NODE_ENV=production`** on the API:

| Area | Behavior |
|------|----------|
| **HTTP errors to browsers** | Still generic (`500` → `"Internal server error"`). No stack traces in JSON. |
| **`/health`** | Returns only `{ "status": "ok" }` (no version/env fingerprinting). |
| **Morgan (access log)** | `tiny` format (not `combined` — avoids logging client IP / user-agent on every line). |
| **`error_logs` table** | Stack traces are **not** stored in production; nested `stack` keys are stripped. |
| **Winston** | Log level `info`; no `debug` noise; error stacks only when `NODE_ENV !== "production"`. |
| **Score worker** | Does not log full scoring `response` JSON in production (summary only). |
| **Next.js browser bundle** | `removeConsole` (production build) strips `console.log` / `warn` / `info` (keeps `console.error`). |

Server logs are still for **you** (host logs, not public). Never expose raw `.env` or DB URLs in client-side code.

---

## 2. Environment variables (minimum)

### Backend (API + all workers — same env)

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | **`production`** |
| `DATABASE_URL` | Neon PostgreSQL |
| `REDIS_URL` | Upstash Redis (`rediss://…`) |
| `JWT_SECRET` | ≥32 random chars |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth |
| `FRONTEND_URL` | Exact site origin, e.g. `https://app.yourdomain.com` (no trailing slash) |
| `OAUTH_CALLBACK_BASE_URL` | **Public API base**, e.g. `https://api.yourdomain.com` (must match OAuth redirect URLs) |
| `PORT` | API port (often set by host, e.g. `3001` or `10000`) |
| `GITHUB_PAT` | Optional — GitHub profile fetch |

### Frontend (build-time / runtime)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | **Public API base** — same idea as `OAUTH_CALLBACK_BASE_URL` (e.g. `https://api.yourdomain.com`) |

---

## 3. Commands on the server (no `dev:all`)

Run these **after** `git pull`, installing deps, and setting env.

### One-time / per deploy

```bash
# Repo root — backend
npm ci                    # or npm install
npm run build             # compiles to dist/
npm run migrate           # drizzle-kit push — align DB schema (run against prod carefully)

# Frontend
cd scorebook-frontend && npm ci && npm run build && cd ..
```

### Processes to keep running (5 Node processes)

Use **systemd**, **PM2**, or your host’s “background worker” feature — same machine or split, but **one shared Redis** and **one DATABASE_URL**.

| # | Role | Command (from repo root) |
|---|------|---------------------------|
| 1 | **API** | `NODE_ENV=production node dist/index.js` |
| 2 | **Fetch worker** | `NODE_ENV=production node dist/workers/fetchWorker.js` |
| 3 | **Score worker** | `NODE_ENV=production node dist/workers/scoreWorker.js` |
| 4 | **Refresh worker** | `NODE_ENV=production node dist/workers/refreshWorker.js` |
| 5 | **Snapshot worker** | `NODE_ENV=production node dist/workers/snapshotWorker.js` |

NPM aliases (same as above):

```bash
npm run start:api              # API
npm run worker:fetch:prod
npm run worker:score:prod
npm run worker:refresh:prod
npm run worker:snapshot:prod
```

### Frontend (Next.js)

After `cd scorebook-frontend && npm run build`:

```bash
cd scorebook-frontend
NODE_ENV=production npm run start   # default port 3000, or use host’s start command
```

Or deploy the **standalone** output if you configure `output: 'standalone'` (optional later).

### Stop (example with PM2)

```bash
pm2 stop ecosystem.config.cjs   # if you use PM2
# or stop each systemd service / disable workers on the host
```

---

## 4. Where to deploy (good “for now” options)

| Layer | Easy options | Notes |
|-------|----------------|-------|
| **Frontend** | **Vercel**, **Netlify**, **Cloudflare Pages** | Set `NEXT_PUBLIC_API_URL` to your API. Connect Git repo → auto build. |
| **API** | **Railway**, **Render** (Web Service), **Fly.io**, **DigitalOcean App Platform** | Set all backend env vars; expose HTTPS URL → use as `OAUTH_CALLBACK_BASE_URL` and as `NEXT_PUBLIC_API_URL`. |
| **Workers** | Same host as API **or** separate “Background Worker” services on **Railway** / **Render** with **identical env** as API | All must use the **same** `REDIS_URL` and `DATABASE_URL`. |
| **Postgres** | **Neon** (already assumed) | Run `npm run migrate` / `db:ensure-profile-slug` when schema changes. |
| **Redis** | **Upstash** (already assumed) | TLS URL for BullMQ + ioredis. |

**Simplest split for a solo deploy:**

1. **Vercel** → Next.js (`scorebook-frontend`).
2. **Railway** (or Render) → one **Web** service running **only** `node dist/index.js`, plus **four Worker** services (or one “worker” box running all four `node dist/workers/*.js` in parallel with PM2).

**OAuth:** In Google Cloud + GitHub OAuth apps, set redirect/callback URLs to:

`https://<YOUR-API-HOST>/auth/google/callback`  
`https://<YOUR-API-HOST>/auth/github/callback`

**CORS:** `FRONTEND_URL` must match the browser origin exactly (your Vercel URL).

---

## 5. After deploy

- [ ] Open `https://<api>/health` → `{"status":"ok"}`  
- [ ] Sign up / login from the deployed frontend  
- [ ] Connect a platform and confirm workers process jobs (host logs / Redis)  
- [ ] Run `npm run smoke:api` locally with `API_BASE_URL=https://<api>` (optional)

See **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)** for a full tick list.

---

## 6. If the DB is missing `profile_slug`

```bash
npm run db:ensure-profile-slug
```

(See **[SETUP.md](./SETUP.md)** for details.)
