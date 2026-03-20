# ScoreBook Frontend — Setup Guide

## What you need

- Node.js 20+
- Your backend running on http://localhost:3001

---

## Step 1 — Install dependencies

```bash
cd scorebook-frontend
npm install
```

---

## Step 2 — Set up environment

```bash
cp .env.local.example .env.local
```

The default `.env.local` already points to your local backend:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Leave it as-is for local development. When you deploy, change this to your production backend URL.

---

## Step 3 — Run with your backend

**Easiest — one command from the monorepo root** (`scorebook-clean`, parent of this folder):

```bash
cd ..          # repo root
npm run dev:all
```

That starts the API, all workers, and this frontend. Frontend: http://localhost:3000 · API: http://localhost:3001

---

**Or separate terminals** (if you prefer):

```bash
# Terminal 1 — backend (repo root)
npm run dev

# Terminal 2 — workers (repo root)
npm run worker:fetch
npm run worker:score
npm run worker:refresh

# Terminal 4 — frontend
cd scorebook-frontend
npm run dev
```

---

## Pages

| URL | Description |
|-----|-------------|
| `/` | Landing page with live leaderboard preview |
| `/login` | Email + password sign-in (GitHub/Google links on the same screen) |
| `/signup` | Create account with email + password → then **Connect** for platform URLs |
| `/dashboard` | Your personal score dashboard |
| `/leaderboard` | Global rankings with platform filters |
| `/connect` | Connect platforms (single URL or **bulk**, one URL per line) |
| `/auth/error` | OAuth error fallback |

---

## How OAuth works

1. User clicks "Sign in with GitHub" → goes to `http://localhost:3001/auth/github`
2. GitHub redirects back to `http://localhost:3001/auth/github/callback`
3. Backend sets a JWT cookie and redirects to `http://localhost:3000/dashboard`
4. Frontend reads the cookie automatically on all API calls (`credentials: "include"`)

**Important:** For this to work, your GitHub OAuth App callback URL must be:
```
http://localhost:3001/auth/github/callback
```

---

## Switching to production

Change exactly ONE line in `.env.local`:
```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

All 20+ API calls across the entire frontend automatically use the new URL. No other changes needed.

---

## Build for production

```bash
npm run build
npm start
```
