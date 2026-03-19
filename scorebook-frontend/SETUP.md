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

Make sure your backend is running first:

```bash
# Terminal 1 — backend
cd scorebook-v2
npm run dev

# Terminal 2 — score worker
cd scorebook-v2
npm run worker:fetch

# Terminal 3 — score worker
cd scorebook-v2
npm run worker:score

# Terminal 4 — frontend
cd scorebook-frontend
npm run dev
```

Frontend runs on: http://localhost:3000
Backend runs on:  http://localhost:3001

---

## Pages

| URL | Description |
|-----|-------------|
| `/` | Landing page with live leaderboard preview |
| `/dashboard` | Your personal score dashboard |
| `/leaderboard` | Global rankings with platform filters |
| `/connect` | Connect new coding platforms |
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
