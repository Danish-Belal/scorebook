# ScoreBook

> **One profile. Every platform. A score that actually reflects how you compete.**

**ScoreBook** is a **developer intelligence platform**: connect your profiles from major coding platforms, get a **single composite score**, see how you **rank** against other developers on ScoreBook, and track **history** over time.

This repo contains the **backend API** (Node.js + Express) and, in `scorebook-frontend/`, the **Next.js** web app.

---

## Screenshots

Drop PNG or WebP captures into [`docs/screenshots/`](./docs/screenshots/) and uncomment (or paste) the lines below so they render on GitHub.

**Suggested files**

| File | What to capture |
|------|------------------|
| `docs/screenshots/dashboard.png` | Signed-in dashboard — composite score, platform cards, queue/history |
| `docs/screenshots/connect.png` | Connect flow — URL input or bulk connect |
| `docs/screenshots/leaderboard.png` | Leaderboard — ranked list (global or filtered) |
| `docs/screenshots/landing.png` | Landing / marketing hero (optional) |

**Markdown to add after you have images**

```markdown
<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="ScoreBook dashboard" width="780" />
</p>
<p align="center"><b>Dashboard</b> — composite score, per-platform breakdown, refresh</p>

<p align="center">
  <img src="docs/screenshots/leaderboard.png" alt="ScoreBook leaderboard" width="780" />
</p>
<p align="center"><b>Leaderboard</b> — see how you rank on ScoreBook</p>

<p align="center">
  <img src="docs/screenshots/connect.png" alt="Connect coding platforms" width="780" />
</p>
<p align="center"><b>Connect</b> — link Codeforces, LeetCode, GitHub, and more</p>
```

Until then, you can run **`npm run dev:all`** (see [SETUP.md](./SETUP.md)) and grab captures locally.

---

## What you can do

- **Sign up / sign in** — Email & password or **Google** / **GitHub** OAuth  
- **Connect platforms** — Paste profile URLs (or bulk); we detect the platform and store your public stats  
- **Dashboard** — Composite score, per-platform breakdown, fairness context, and optional titles/badges derived from your ratings and activity  
- **Leaderboard** — Browse ranked developers (global and per-platform views where supported)  
- **Refresh** — Re-fetch data and recompute your score when you’ve improved externally  
- **Score history** — Trend data for charts (snapshots over time)

Supported platforms include **competitive programming** and **engineering** signals (e.g. Codeforces, LeetCode, CodeChef, AtCoder, and others), plus breadth sources — see the app’s connect flow for the live list.

---

## How your score works (high level)

ScoreBook is designed to answer: *“How strong is this developer **across** the signals we can see?”*

### Multi-signal, not a single number from one site

Your **composite score** reflects **several kinds of activity** — contest performance, practice depth, engineering output where connected, and more. No single platform is the whole story; we combine what you’ve actually linked.

### Contest ratings & rankings

Where a platform exposes **ratings** (contest or skill ratings), **participation**, and similar stats, those feed into your profile. We **normalize** performance so that different sites and scales can be compared fairly inside ScoreBook.

You also get **ranking context**: how you place on **ScoreBook’s leaderboards** (e.g. global and platform-scoped views), not just raw numbers from an external site.

### Weights (conceptually)

Different **categories of signal** contribute with different **importance** — for example, core problem-solving platforms vs. engineering vs. breadth. If you haven’t connected a category, its share is **redistributed** among what *is* connected so the score stays interpretable and doesn’t punish you with empty buckets.

Exact **weights**, **blending rules**, and **internal parameters** are **not public**; they are part of ScoreBook’s proprietary scoring model.

### Fairness & confidence

The engine considers things like **how much data** we have for you and **how recent** your activity is. Sparse or stale profiles don’t get the same certainty as rich, active ones — you’ll see that reflected in score presentation and messaging, without exposing internal formulas.

### Transparency for the user, not for copycats

The product aims to show **enough detail** that you understand *why* your score looks the way it does (platform sections, breakdowns, notes). The **full mathematical specification** of the scoring engine is **intentionally private** and not documented in this README.

---

## Architecture (non-secret)

| Piece | Role |
|--------|------|
| **API** | REST API, auth, OAuth callbacks, rate limits, `GET /health` |
| **Postgres (Neon)** | Users, platform data, scores, history, errors |
| **Redis** | Leaderboards (sorted sets), BullMQ job queues |
| **Workers** | Fetch platform data, compute scores, periodic refresh, daily history snapshots |
| **Frontend** | Next.js 14 app — marketing, auth, connect, dashboard, leaderboard |

---

## Tech stack

- **Backend:** TypeScript, Express, Drizzle ORM, BullMQ, ioredis, Passport (Google/GitHub), Zod  
- **Frontend:** Next.js 14, React  
- **Infra (typical):** Neon, Upstash Redis, Render or similar for API + workers  

---

## Getting started

Full local setup (env vars, migrations, workers, ports) is in **[SETUP.md](./SETUP.md)**.

Quick pointers:

```bash
npm install
cp .env.example .env   # fill DATABASE_URL, REDIS_URL, JWT_SECRET, OAuth, etc.
npm run migrate
npm run dev              # API only — see SETUP for workers + frontend
```

Production checklist: **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)**.

---

## Scripts (backend)

| Script | Purpose |
|--------|---------|
| `npm run dev` | API dev server |
| `npm run dev:all` | API + workers + frontend (see SETUP) |
| `npm run build` / `npm start` | Production compile / run API |
| `npm run worker:*` | Fetch, score, refresh, snapshot workers |
| `npm run test:unit` | Unit tests (scoring + helpers) |
| `npm run migrate` | Apply DB schema (Drizzle) |

---

## Security & privacy

- **Secrets** live in environment variables — never commit `.env`.  
- **OAuth** redirect URLs must match your deployed API base URL.  
- Only **public** profile data you connect is ingested; see your platform’s own privacy policies for what they expose.

---

## License & scoring IP

**Scoring methodology, weights, and internal engine implementation are proprietary.**  
This README describes **product behavior** only. The source code in this repository is provided under the terms of the license file in the repo (add a `LICENSE` file if you haven’t yet).

---

## Contact

Add your website, Discord, or email here when you publish.
