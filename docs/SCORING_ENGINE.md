# ScoreBook — Scoring Engine Deep Dive

> **Purpose:** This document explains exactly how ScoreBook calculates every developer's score — step by step, with formulas, examples, and the reasoning behind every design decision. Keep this as your reference document.

---

## Table of Contents

1. [The Core Idea](#1-the-core-idea)
2. [Why Not Just Average Ratings?](#2-why-not-just-average-ratings)
3. [The 9 Platforms & Their Weights](#3-the-9-platforms--their-weights)
4. [Step-by-Step: How a Score is Computed](#4-step-by-step-how-a-score-is-computed)
   - Step 1: Fetch Raw Data
   - Step 2: Extract Metrics
   - Step 3: Percentile Rank Each Metric
   - Step 4: Platform Score
   - Step 5: Composite Raw Score
   - Step 6: Recency Factor
   - Step 7: Confidence Factor
   - Step 8: Final Score + Bounds
5. [Percentile Rank Formula — Explained](#5-percentile-rank-formula--explained)
6. [Continuous Difficulty Weighting (Codeforces)](#6-continuous-difficulty-weighting-codeforces)
7. [Log Transform — Why We Use It](#7-log-transform--why-we-use-it)
8. [Recency Decay — Full Explanation](#8-recency-decay--full-explanation)
9. [Confidence Factor — Preventing Gaming](#9-confidence-factor--preventing-gaming)
10. [Score Confidence Interval](#10-score-confidence-interval)
11. [Graceful Degradation — Missing Platforms](#11-graceful-degradation--missing-platforms)
12. [Platform Spotlight — Dashboard Cards](#12-platform-spotlight--dashboard-cards)
13. [Full Worked Example](#13-full-worked-example)
14. [Scaling: 10 Users to 100 Million](#14-scaling-10-users-to-100-million)
15. [Why This Is Fair](#15-why-this-is-fair)
16. [Files Reference](#16-files-reference)

---

## 1. The Core Idea

ScoreBook answers one question:

> **"Compared to every other developer registered on ScoreBook, how good are you across all your coding platforms?"**

The final score is a number from **0 to 100**. It means:

- **Score 90** → You outperform 90% of all developers registered on ScoreBook
- **Score 50** → You are exactly median
- **Score 10** → 90% of developers here are ahead of you

The score is **always relative to the registered user base**. It is never an absolute number. When a new stronger developer joins, everyone's score may shift slightly. This is intentional — it keeps the leaderboard honest and self-calibrating.

---

## 2. Why Not Just Average Ratings?

The naive approach would be:

```
score = (CF_rating + LC_rating + CC_rating) / 3
```

**This is completely broken.** Here's why:

| Platform | Scale | What "1800" means |
|---|---|---|
| Codeforces | 0 – 4000 | Expert (top 15%) |
| LeetCode contest | 0 – 3500 | ~Top 20% |
| CodeChef | 0 – 3500 | 4-star (top 25%) |
| HackerRank score | 0 – 3000 | Very different unit entirely |

A Codeforces rating of 1800 and a LeetCode contest rating of 1800 are **completely different things**. Adding them is like adding miles and kilograms.

**Our solution: Convert every metric to a percentile rank first.**

A percentile rank is a universal currency. "82nd percentile on Codeforces" and "71st percentile on LeetCode" are now comparable — they're both on a 0–100 scale relative to the same user pool.

---

## 3. The 9 Platforms & Their Weights

```
Total weight must always sum to 100%
```

| # | Platform | Weight | Tier | Reason |
|---|---|---|---|---|
| 1 | **Codeforces** | 25% | S | Gold standard of competitive programming. Problems are mathematically hardest. Rating system is Elo-based and most battle-tested globally. Elite user pool. |
| 2 | **LeetCode** | 20% | S | Industry standard for software engineering interviews. Excellent difficulty calibration. Contest rating is reliable. Huge user base (millions). |
| 3 | **GitHub** | 20% | S | Real-world engineering output. Merged PRs, commits, stars, reviews — these measure what you actually build, not just competitive skills. |
| 4 | **CodeChef** | 12% | A | Largest CP platform in India. Upgraded to Elo-MMR system in 2022. Millions of active users. Especially strong South Asian developer signal. |
| 5 | **AtCoder** | 10% | A | Highest problem quality globally (algorithmic purity). Very prestigious in Asia. Rating system is extremely well designed. |
| 6 | **HackerRank** | 5% | B | 7M+ users. Gold/Silver/Bronze certifications are verifiable and recruiter-facing. Domain-specific skills (SQL, Python, etc.) that others don't measure. |
| 7 | **TopCoder** | 4% | B | Oldest CP platform (SRMs since 2001). Algorithm rating is the original battle-tested competitive rating. Niche but historically prestigious. |
| 8 | **HackerEarth** | 3% | C | 5M+ devs, strong in Indian market, public profile API. |
| 9 | **GFG** | 1% | C | Practice-oriented, large beginner pool. Lower difficulty ceiling — therefore low weight. Good for consistency signal only. |

**Key principle:** Weights are not arbitrary. They reflect:
1. **Problem difficulty ceiling** — how hard can the problems get?
2. **Rating system quality** — is the rating statistically sound?
3. **Community prestige** — do top developers use this platform?
4. **Real-world signal** — does performance here predict engineering ability?

---

## 4. Step-by-Step: How a Score is Computed

Here is the entire pipeline that runs every time a user's data is fetched.

---

### Step 1: Fetch Raw Data

A background worker (`fetchWorker.ts`) calls each platform's API or scraper for the user's profile URL.

```
User adds: https://codeforces.com/profile/tourist
              ↓
  Extract username: "tourist"
              ↓
  Call Codeforces API:
    GET /api/user.info?handles=tourist
    GET /api/user.rating?handle=tourist
    GET /api/user.status?handle=tourist&count=10000
              ↓
  Store raw JSON in platform_data table
              ↓
  Enqueue ScoreJob
```

Data fetched per platform:

| Platform | What We Fetch |
|---|---|
| Codeforces | Current rating, max rating, full contest history, all accepted submissions with difficulty rating |
| LeetCode | Contest rating, easy/medium/hard solved, streak, contests attended, acceptance rate |
| CodeChef | Current rating, max rating, stars (1-7), contests participated, problems solved |
| AtCoder | Rating, max rating, color tier, contests participated, wins |
| HackerRank | Badge scores by domain, certifications, problems solved |
| HackerEarth | Rating, problems solved, contests entered |
| TopCoder | Algorithm SRM rating, max rating, competitions count |
| GFG | Practice score, problems solved, coding streak |
| GitHub | Merged PRs, commits last year, stars earned, PR reviews, contribution days, account age |

---

### Step 2: Extract Metrics

File: `src/services/scoring/metrics.ts`

Raw API data is messy. We extract clean numeric signals from it. Each platform gives us a flat `Record<string, number>`:

**Codeforces example:**
```typescript
// Raw data has: { userInfo: { rating: 1847, maxRating: 2104, contribution: 143 }, 
//                 ratingHistory: [...50 contests...],
//                 problemsSolvedByRating: { "800": 45, "1000": 38, "1200": 29, ... } }

// Extracted metrics:
{
  currentRating:        1847,
  maxRating:            2104,
  weightedProblemScore: 847.3,  // ← continuous difficulty weighting applied here (see Section 6)
  contestsParticipated: 50,
  contributionScore:    143,
}
```

**GitHub example:**
```typescript
// Raw data has many fields...
// Extracted metrics:
{
  totalMergedPRs:       143,
  totalCommitsLastYear: 892,
  totalStarsEarned:     1240,   // ← capped at 10,000 to prevent viral outlier distortion
  totalReviewsLastYear: 67,
  totalContribDays:     218,
  accountAgeFactor:     87.3,   // ← (accountAgeDays / (7*365)) * 100, capped at 100
}
```

---

### Step 3: Percentile Rank Each Metric

File: `src/services/scoring/percentile.ts`

This is the heart of the engine. For **every metric**, we load the values from **all registered users** and compute where this user stands.

**Formula:**

```
PR(x) = (users_with_value_below_x + 0.5 × users_with_value_equal_to_x) / N × 100
```

The `0.5 × equal` term is the **midpoint formula** — it handles ties fairly. If 100 users all have the same Codeforces rating, they all get exactly the 50th percentile for that metric, not 0th.

**Example:** 5 users with Codeforces ratings: [800, 1200, 1500, 1800, 2400]

| User | Rating | Below | Equal | PR |
|---|---|---|---|---|
| A | 800 | 0 | 1 | (0 + 0.5) / 5 × 100 = **10.0** |
| B | 1200 | 1 | 1 | (1 + 0.5) / 5 × 100 = **30.0** |
| C | 1500 | 2 | 1 | (2 + 0.5) / 5 × 100 = **50.0** |
| D | 1800 | 3 | 1 | (3 + 0.5) / 5 × 100 = **70.0** |
| E | 2400 | 4 | 1 | (4 + 0.5) / 5 × 100 = **90.0** |

Note that with 5 users, the top user gets 90th percentile, not 100th. This is correct — you can never be "above 100%" of a pool you're part of.

**Before running percentile rank, some metrics are log-transformed** (see Section 7).

The following metrics are log-transformed:
```
totalStarsEarned, totalMergedPRs, totalCommitsLastYear,
weightedProblemScore, practiceScore, overallScore
```

---

### Step 4: Platform Score

File: `src/services/scoring/composite.ts`

After getting a percentile rank (0–100) for every metric, we compute a single score per platform using a **weighted average**:

```
platform_score = Σ (metric_weight × metric_PR) / Σ metric_weight
```

**LeetCode weights:**
```
contestRating:    40%
hardSolved:       25%
mediumSolved:     15%
attendedContests: 12%
acceptanceRate:    8%
```

**Example — LeetCode:**
```
Suppose a user's percentile ranks are:
  contestRating PR    = 78.0
  hardSolved PR       = 65.0
  mediumSolved PR     = 82.0
  attendedContests PR = 55.0
  acceptanceRate PR   = 70.0

LeetCode score = (78×0.40) + (65×0.25) + (82×0.15) + (55×0.12) + (70×0.08)
               = 31.2 + 16.25 + 12.3 + 6.6 + 5.6
               = 71.95
```

---

### Step 5: Composite Raw Score

```
composite_raw = Σ (platform_weight × platform_score) / Σ (weights of connected platforms only)
```

The denominator uses **only connected platforms** — if a user hasn't added CodeChef, that 12% weight is redistributed proportionally to the platforms they have connected. This is **graceful degradation** (see Section 11).

**Example — user with only CF + LC + GitHub connected:**
```
Connected weights: CF=0.25, LC=0.20, GH=0.20 → total = 0.65

composite_raw = (0.25×82.1 + 0.20×71.95 + 0.20×68.9) / 0.65
              = (20.525 + 14.39 + 13.78) / 0.65
              = 48.695 / 0.65
              = 74.92
```

---

### Step 6: Recency Factor

File: `src/services/scoring/recency.ts`

A developer who was great in 2020 but hasn't coded since should not permanently hold a top spot. The recency factor penalises inactivity.

**Formula:**

```
recency_factor = 0.70 + 0.30 × (1 - e^(-0.12 × active_months))
```

Where `active_months` = number of distinct months in the last 12 months where the user was active on at least one platform.

| Active Months | Recency Factor |
|---|---|
| 0 | 0.700 (inactive floor) |
| 3 | 0.806 |
| 6 | 0.873 |
| 9 | 0.918 |
| 12 | 0.946 |

**How "active month" is detected per platform:**
- **Codeforces:** any contest with timestamp in that month
- **LeetCode:** streak days / 25 → estimated active months; any contest = active
- **CodeChef:** estimated from contest count
- **GitHub:** commits / 10 → estimated active months (10 commits ≈ 1 active month)
- **Others:** any rating > 0 or problems solved → marks current month active

Active months from all platforms are **deduplicated** — if you competed on Codeforces AND pushed to GitHub in March, that's still just 1 active month, not 2.

---

### Step 7: Confidence Factor

File: `src/services/scoring/metrics.ts` → `computeConfidenceFactor()`

A brand new improvement in v2. This prevents a developer who just signed up with one lucky contest performance from leaping to rank #1.

**Formula:**

```
contest_confidence = min(1.0, total_contests / 10)
problem_confidence = min(1.0, total_problems / 50)
raw_confidence     = max(contest_confidence, problem_confidence)
confidence_factor  = 0.80 + 0.20 × raw_confidence
```

| Experience | Confidence Factor |
|---|---|
| Brand new (0 contests, 0 problems) | 0.80 |
| 5 contests or 25 problems | 0.90 |
| 10 contests or 50 problems | 1.00 (full confidence) |

**Why 80% floor?** A completely new user with no track record still gets 80% of their raw score — we don't penalise them harshly, we just don't fully trust a thin data set. As they build history, confidence reaches 1.0 naturally.

---

### Step 8: Final Score + Confidence Interval

```
final_score = composite_raw × recency_factor × confidence_factor

spread       = (1 - confidence_factor) × 10
score_lower  = max(0,   final_score - spread)
score_upper  = min(100, final_score + spread)
```

**Full example:**
```
composite_raw    = 74.92
recency_factor   = 0.94   (active 10 of last 12 months)
confidence_factor = 0.97  (veteran user, many contests)

final_score = 74.92 × 0.94 × 0.97 = 68.38

spread      = (1 - 0.97) × 10 = 0.3
score_lower = 68.38 - 0.3 = 68.08
score_upper = 68.38 + 0.3 = 68.68

API response: { compositeScore: 68.38, scoreLower: 68.08, scoreUpper: 68.68 }
```

For a new user with confidence 0.80:
```
spread      = (1 - 0.80) × 10 = 2.0
score_lower = 68.38 - 2.0 = 66.38
score_upper = 68.38 + 2.0 = 70.38
```

Wider band = "we think you're around 68, but we're not very certain yet".

---

## 5. Percentile Rank Formula — Explained

```typescript
// Binary-search optimized implementation
function computePercentileRank(value, sortedValues) {
  const N     = sortedValues.length
  const below = lowerBound(sortedValues, value)   // count of values strictly < target
  const above = upperBound(sortedValues, value)   // count of values <= target
  const equal = above - below                     // count of values == target

  return ((below + 0.5 * equal) / N) * 100
}
```

**Why binary search?** For 1M users and 15 metrics, a naive O(N) scan would take 15M comparisons per score update. Binary search reduces each lookup to O(log N) — 20 comparisons for 1M users instead of 1,000,000.

**Why the midpoint formula?** Consider a platform where 10,000 users all have rating 1200 (common in early CodeChef). Naive formula: everyone gets 0th percentile (nothing is below them). Midpoint formula: everyone gets 50th percentile (they're in the middle of their tied group). This is statistically correct and fair.

---

## 6. Continuous Difficulty Weighting (Codeforces)

v1 used discrete buckets:
```
rating >= 2000 → weight 3×
rating >= 1600 → weight 2×
```

v2 uses a smooth continuous formula:

```
difficulty_weight(r) = 1.0 + (r / 800) ^ 1.5
```

| Problem Rating | Weight |
|---|---|
| 400 | 1.35× |
| 800 | 2.00× |
| 1200 | 3.08× |
| 1600 | 4.53× |
| 2000 | 6.39× |
| 2400 | 8.63× |
| 3000 | 12.84× |

**Why 1.5 exponent?** It reflects the exponential increase in difficulty on Codeforces — a 2400 problem is not just 3× harder than an 800 problem, it requires qualitatively different mathematical knowledge. The 1.5 exponent was chosen to match empirically observed solve-rate ratios across the platform.

**Result:** A user who solved 50 problems rated 2000+ gets a much higher `weightedProblemScore` than someone who solved 200 problems rated 800. This is correct — depth matters more than volume at the elite level.

---

## 7. Log Transform — Why We Use It

Some metrics have extremely skewed distributions. For example GitHub stars:
- 90% of developers: 0–50 stars total
- 1% of developers: 1,000–10,000 stars
- 0.01% of developers: 100,000+ stars (viral repos)

Without transformation, Linus Torvalds' GitHub stars would compress everyone else's score to near-zero — even highly active developers would rank at the 2nd percentile because they have fewer stars than one viral repo owner.

**Log transform:** `transformed = log(1 + value)`

| Raw Value | Log-transformed |
|---|---|
| 0 | 0 |
| 10 | 2.40 |
| 100 | 4.62 |
| 1,000 | 6.91 |
| 10,000 | 9.21 |
| 100,000 | 11.51 |

The difference between 0 and 100 stars (2.40 log units) is now comparable to the difference between 100 and 10,000 stars (4.59 log units) — a much fairer compression.

**Additionally, GitHub stars are capped at 10,000** before log-transforming to further prevent one viral repo from distorting the entire leaderboard.

Metrics that are log-transformed:
```
totalStarsEarned      (GitHub)
totalMergedPRs        (GitHub)
totalCommitsLastYear  (GitHub)
weightedProblemScore  (Codeforces)
practiceScore         (GFG)
overallScore          (HackerRank)
```

---

## 8. Recency Decay — Full Explanation

The formula:
```
recency_factor = MIN + (1 - MIN) × (1 - e^(-DECAY × months))

where:
  MIN   = 0.70  (inactive floor — you can never lose more than 30%)
  DECAY = 0.12
```

**Why exponential decay?** The first few active months give the biggest boost. Going from 0 to 3 active months adds ~10 percentage points to the factor. Going from 9 to 12 active months only adds ~3 points. This is intentional — we mostly want to penalise complete inactivity, not punish people for taking a month off.

**Why 70% floor?** If we set the floor to 0%, a developer who hasn't coded in 2 years would have a score of 0 — even if they're Grandmaster on Codeforces. That's not useful. The 70% floor says: "Your past achievements still count for 70% of your score. But active developers will always outrank you."

**Activity detection is cross-platform.** If you pushed code to GitHub every day but didn't touch Codeforces, you're still considered active. The recency factor rewards any coding activity, not just competitive programming.

---

## 9. Confidence Factor — Preventing Gaming

**The problem this solves:** Without confidence gating, a developer could create an account, do extremely well in one LeetCode contest (getting lucky or having a good day), and immediately jump to rank #1 on our leaderboard — ahead of Grandmasters with years of track records.

**The solution:**

```
confidence = 0.80 + 0.20 × min(1.0, max(contest_ratio, problem_ratio))

contest_ratio = total_contests / 10
problem_ratio = total_problems / 50
```

A developer needs either **10 contests** or **50 problems solved across all platforms** to reach full confidence (1.0).

Below that threshold, their score is scaled down. At 0 contests and 0 problems, they get 80% of their raw score. This is still a fair score — just with a small "new user" penalty that disappears naturally as they build history.

**This also improves score quality** — a user with 50 contests has a much more statistically reliable percentile rank than a user with 1 contest. The confidence factor reflects this uncertainty in the final number.

---

## 10. Score Confidence Interval

Every score in the API response comes with three values:

```json
{
  "compositeScore": 74.32,
  "scoreLower": 71.10,
  "scoreUpper": 77.54
}
```

**What it means:**
- We're 90% confident the user's "true" score is between 71.10 and 77.54
- The central estimate is 74.32
- The band is wider for newer users, tighter for veterans

**Formula:**
```
spread      = (1 - confidence_factor) × 10
score_lower = composite - spread
score_upper = composite + spread
```

**How to use this in the UI:**
- Show the central score prominently: `74.32`
- Show the range as a subtle indicator: `(71 – 78)`
- For rank comparison: only rank user A above user B if `A.scoreLower > B.scoreUpper` (borrowed from Scale AI's leaderboard methodology)

---

## 11. Graceful Degradation — Missing Platforms

A developer who only uses GitHub and LeetCode should not be penalised compared to someone who uses all 9 platforms. The missing platforms' weights are redistributed proportionally.

**Example:**
```
User only has: GitHub (20%) + LeetCode (20%) + Codeforces (25%)
Total connected weight = 65%

Effective platform weights for this user:
  Codeforces: 25 / 65 = 38.5%
  LeetCode:   20 / 65 = 30.8%
  GitHub:     20 / 65 = 30.8%
  (CodeChef, AtCoder, etc. = 0% — excluded)
```

This means the score is still 0–100 and still represents "percentile rank among ScoreBook users on the platforms you use". A pure competitive programmer with Codeforces Grandmaster status will still score very high, even without GitHub or GFG.

---

## 12. Platform Spotlight — Dashboard Cards

In addition to the overall composite score, the API returns individual platform sections:

```json
"platforms": {
  "codeforces": {
    "displayName": "Codeforces",
    "fetchStatus": "success",
    "rawData": { ... },        ← full raw data from the API
    "badge": "Expert",         ← human-readable tier
    "rankAmongUs": 3,          ← rank #3 on CF among ScoreBook users
    "totalOnPlatform": 312,    ← 312 ScoreBook users have CF connected
    "percentile": 99.1,        ← top 0.9% of ScoreBook users on CF
    "subScore": 82.10          ← this user's CF-only score (0–100)
  }
}
```

This powers the individual platform cards on the dashboard — "Your LeetCode", "Your GitHub", etc. Each card shows:
- Their rating/score on that platform
- Their rank among ScoreBook users specifically
- Their tier badge (Expert, 5★, Yellow Coder, etc.)
- All their raw stats from that fetch

**Badges by platform:**

| Platform | Badge Examples |
|---|---|
| Codeforces | Newbie → Pupil → Specialist → Expert → Candidate Master → Master → Grandmaster → International Grandmaster → Legendary Grandmaster |
| CodeChef | 1★ → 2★ → 3★ → 4★ → 5★ → 6★ → 7★ |
| AtCoder | Grey → Brown → Green → Cyan → Blue → Yellow → Orange → Red |
| TopCoder | Grey → Green → Blue → Yellow → Red Coder |
| LeetCode | Hard Solved count + Contest Rating |
| GitHub | Merged PR count + Stars earned |

---

## 13. Full Worked Example

Let's score a real-world-ish developer: **"Danish"**

### Connected platforms:
- Codeforces: rating 1847, max 2104, 312 problems solved (weighted), 50 contests
- LeetCode: contest rating 1623, 45 hard, 180 medium, 28 contests, 72% acceptance
- GitHub: 143 merged PRs, 892 commits/yr, 1240 stars, 67 reviews, 218 contrib days, 4yr account

### Step 1: Extract metrics ✓ (shown above)

### Step 2: Percentile ranks (hypothetical pool of 500 users)

| Platform | Metric | Raw Value | Percentile |
|---|---|---|---|
| Codeforces | currentRating | 1847 | 85.2 |
| Codeforces | maxRating | 2104 | 88.6 |
| Codeforces | weightedProblemScore | 847 | 79.4 |
| Codeforces | contestsParticipated | 50 | 82.0 |
| Codeforces | contributionScore | 143 | 71.0 |
| LeetCode | contestRating | 1623 | 72.1 |
| LeetCode | hardSolved | 45 | 68.4 |
| LeetCode | mediumSolved | 180 | 74.3 |
| LeetCode | attendedContests | 28 | 61.0 |
| LeetCode | acceptanceRate | 0.72 | 78.0 |
| GitHub | totalMergedPRs | log(144)=4.97 | 84.3 |
| GitHub | totalCommitsLastYear | log(893)=6.80 | 76.1 |
| GitHub | totalStarsEarned | log(1241)=7.12 | 68.9 |
| GitHub | totalReviewsLastYear | 67 | 72.4 |
| GitHub | totalContribDays | 218 | 80.0 |

### Step 3: Platform scores

```
Codeforces: (85.2×0.40) + (88.6×0.15) + (79.4×0.25) + (82.0×0.12) + (71.0×0.08)
          = 34.08 + 13.29 + 19.85 + 9.84 + 5.68
          = 82.74

LeetCode: (72.1×0.40) + (68.4×0.25) + (74.3×0.15) + (61.0×0.12) + (78.0×0.08)
        = 28.84 + 17.10 + 11.15 + 7.32 + 6.24
        = 70.65

GitHub: (84.3×0.30) + (76.1×0.20) + (68.9×0.18) + (72.4×0.12) + (80.0×0.10) + (account_factor×0.10)
      ≈ 25.29 + 15.22 + 12.40 + 8.69 + 8.00 + ~7.5
      ≈ 77.10
```

### Step 4: Composite raw (3 platforms connected)

```
Connected weight = 0.25 + 0.20 + 0.20 = 0.65

composite_raw = (0.25×82.74 + 0.20×70.65 + 0.20×77.10) / 0.65
              = (20.69 + 14.13 + 15.42) / 0.65
              = 50.24 / 0.65
              = 77.29
```

### Step 5: Recency factor

Danish competed in 11 of the last 12 months:
```
recency = 0.70 + 0.30 × (1 - e^(-0.12×11))
        = 0.70 + 0.30 × (1 - e^(-1.32))
        = 0.70 + 0.30 × 0.733
        = 0.70 + 0.220
        = 0.920
```

### Step 6: Confidence factor

50 CF contests + 28 LC contests = 78 total. Max'd out at 1.0:
```
confidence = 0.80 + 0.20 × min(1.0, 78/10) = 1.00
```

### Step 7: Final score

```
final = 77.29 × 0.920 × 1.00 = 71.11

spread      = (1 - 1.0) × 10 = 0.0
score_lower = 71.11
score_upper = 71.11
```

**Danish's final score: 71.11 / 100** — tight confidence interval because he's a veteran user.

---

## 14. Scaling: 10 Users to 100 Million

The percentile engine is the most computationally intensive part. Here's how it scales:

| Scale | Strategy | Technology |
|---|---|---|
| **10 – 100K users** | Load all values into memory, sort once, binary search. O(N log N) batch recompute per refresh. | Node.js arrays, PostgreSQL |
| **100K – 1M users** | Same approach, but batch recompute runs as a background job every hour, not on every score update. | BullMQ scheduled job |
| **1M – 10M users** | Switch to PostgreSQL's built-in `percentile_cont()` function for batch. Use Redis Sorted Sets for live rank. | `ZADD`/`ZRANK` O(log N) |
| **10M – 100M users** | t-digest algorithm: compress entire distribution into ~1,000 centroids. Error < 0.5% at tails. Memory = O(1) regardless of N. | `tdigest` npm package |

**Redis Sorted Sets for live leaderboard (all scales):**
```
ZADD  scorebook:leaderboard {score} {userId}  → O(log N) insert/update
ZRANK scorebook:leaderboard {userId}          → O(log N) rank lookup
ZREVRANGE scorebook:leaderboard 0 99          → O(log N + 100) top 100
```

At 100M users, a rank lookup is still sub-millisecond. This is the same approach used by gaming leaderboards at scale (Steam, Xbox Live).

---

## 15. Why This Is Fair

Here is a summary of every fairness property the engine guarantees:

| Property | Mechanism |
|---|---|
| **Cross-platform comparable** | Percentile rank converts all platforms to same 0–100 scale |
| **No outlier distortion** | Log transform on skewed metrics; GitHub stars capped at 10K |
| **Ties are handled fairly** | Midpoint formula: tied users all get the same percentile |
| **Missing platforms don't penalise** | Disconnected platform weights redistributed proportionally |
| **Recent activity rewarded** | Recency factor (0.70–1.00) based on active months in last 12 |
| **Past excellence preserved** | 70% floor — inactivity reduces but never zeros out your score |
| **New users can't game system** | Confidence factor (0.80–1.00) — builds with experience |
| **Score uncertainty is visible** | Confidence interval shows how certain we are |
| **Platform difficulty respected** | Weights reflect problem quality, rating system soundness, prestige |
| **Self-calibrating over time** | As user pool grows, percentile ranks auto-adjust for everyone |

---

## 16. Files Reference

```
src/services/scoring/
├── weights.ts      Platform weights (must sum to 1.0), metric weights per platform,
│                   RECENCY_CONFIG, CONFIDENCE_CONFIG, continuousDifficultyWeight()
│
├── metrics.ts      extractMetrics(platform, rawData) → PlatformMetrics
│                   computeConfidenceFactor(allMetrics) → number
│                   LOG_TRANSFORM_METRICS set
│
├── percentile.ts   computePercentileRank(value, context) → 0–100
│                   computePRWithInterval(value, context, confidence) → {pr, lower, upper}
│                   batchComputePercentiles(Map<userId, value>) → Map<userId, PR>
│                   logTransform(value) → number
│
├── recency.ts      computeRecencyFactor(platformData) → 0.70–1.00
│                   activityLabel(factor) → string
│
├── composite.ts    computeCompositeScore(userMetrics, contexts, recency, confidence)
│                     → CompositeResult { finalScore, scoreLower, scoreUpper, breakdown, ... }
│                   buildSpotlight(platform, metrics, score) → spotlight object
│
└── index.ts        scoreUser(userId) → Promise<finalScore>
                    Full pipeline: load data → build contexts → compute → persist → Redis
```

**Data flow summary:**
```
platform_data table (raw JSON)
        ↓  extractMetrics()
PlatformMetrics (flat numbers)
        ↓  logTransform() on skewed metrics
Transformed values
        ↓  computePercentileRank() vs all users
Percentile ranks (0–100 per metric)
        ↓  weighted average (METRIC_WEIGHTS)
Platform score (0–100 per platform)
        ↓  weighted average (PLATFORM_WEIGHTS, redistributed for missing platforms)
Composite raw (0–100)
        ↓  × recency_factor × confidence_factor
Final score (0–100)
        ↓  ± spread
Score bounds [lower, upper]
        ↓  ZADD to Redis sorted set
Live leaderboard rank (O(log N))
```

---

*Last updated: March 2026 — ScoreBook v2.0*
*Engine designed for fairness, transparency, and scale.*
