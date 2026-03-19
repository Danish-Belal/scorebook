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
3. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
4. Application type: **Web application**
5. Add `http://localhost:3001/auth/google/callback` under Authorized redirect URIs
6. Copy **Client ID** and **Client Secret**

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

## All commands

```bash
npm install           # install dependencies
npm run migrate       # create database tables (run once)
npm run dev           # start API server
npm run worker:fetch  # start fetch worker
npm run worker:score  # start score worker
npm run worker:refresh # start refresh cron
npm run test:unit     # run scoring engine tests
npm run build         # compile TypeScript for production
```

---

## Testing the full flow

1. Visit `http://localhost:3001/auth/github` in your browser
2. Log in with GitHub — you'll be redirected to `http://localhost:3000/dashboard` 
   (the frontend isn't built yet, this is expected)
3. Grab your JWT from the cookie in browser DevTools
4. Connect a Codeforces profile:
   ```bash
   curl -X POST http://localhost:3001/api/platforms/connect \
     -H "Content-Type: application/json" \
     -H "Cookie: token=YOUR_JWT" \
     -d '{"profileUrl": "https://codeforces.com/profile/tourist"}'
   ```
5. Wait ~10 seconds, then check your score:
   ```bash
   curl http://localhost:3001/api/scores/me \
     -H "Cookie: token=YOUR_JWT"
   ```
