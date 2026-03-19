/**
 * ScoreBook Scoring Engine v2 — Platform Weights & Configuration
 *
 * DESIGN PRINCIPLES:
 * 1. Percentile-rank normalization (not raw ratings) — cross-platform fair comparison
 * 2. Platform weights reflect difficulty, user-pool quality, and prestige
 * 3. Missing platforms redistribute weight proportionally (graceful degradation)
 * 4. Continuous difficulty weighting — no arbitrary buckets
 * 5. Confidence intervals — users with few data points get wider uncertainty bands
 * 6. Recency decay — recent activity is rewarded, inactivity penalised (floor: 70%)
 */

export type Platform =
  | "codeforces"
  | "leetcode"
  | "codechef"
  | "atcoder"
  | "hackerrank"
  | "hackerearth"
  | "topcoder"
  | "gfg"
  | "github";

export const ALL_PLATFORMS: Platform[] = [
  "codeforces",
  "leetcode",
  "codechef",
  "atcoder",
  "hackerrank",
  "hackerearth",
  "topcoder",
  "gfg",
  "github",
];

// ─── Platform Weights ─────────────────────────────────────────────────────────
// Must sum to 1.0. Reflects difficulty, community quality, and industry signal.
export const PLATFORM_WEIGHTS: Record<Platform, number> = {
  codeforces:  0.25, // Gold standard CP — world's hardest problems, most respected rating system, elite global pool; top priority
  leetcode:    0.20, // Industry interview gold standard — contest rating is most-checked signal by FAANG recruiters
  github:      0.20, // Real engineering output — PRs, commits, impact metrics
  codechef:    0.12, // Largest CP platform in India — Elo-MMR rating, millions of users
  atcoder:     0.10, // Highest problem quality globally — prestigious in Asia
  hackerrank:  0.05, // 7M+ users, broad skill domains, recruiter-facing certifications
  topcoder:    0.04, // Oldest CP platform, SRMs, cash prizes, niche but prestigious
  hackerearth: 0.03, // 5M+ devs, strong in Indian market, hiring assessments
  gfg:         0.01, // Practice-oriented, large beginner-to-intermediate pool
};

// ─── Per-Platform Metric Weights ──────────────────────────────────────────────
// Must sum to 1.0 per platform. Weights reflect each metric's signal quality.
export const METRIC_WEIGHTS: Record<Platform, Record<string, number>> = {
  codeforces: {
    currentRating:        0.45, // Primary ELO signal — most respected CP rating in world
    maxRating:            0.20, // Peak rating matters — many recruiters screen by this
    weightedProblemScore: 0.22, // Depth × difficulty (continuous weight formula)
    contestsParticipated: 0.10, // Consistency signal
    contributionScore:    0.03, // Community contributions — minor signal
  },
  leetcode: {
    contestRating:     0.40, // LC's own ELO — most reliable single signal
    hardSolved:        0.25, // Hard problems are interview gold
    mediumSolved:      0.15,
    attendedContests:  0.12, // Consistency
    acceptanceRate:    0.08, // Quality over quantity signal
  },
  codechef: {
    currentRating:        0.45, // Elo-MMR backed since 2022 — very reliable
    maxRating:            0.15,
    stars:                0.15, // 1-7 star tier system — intuitive prestige
    contestsParticipated: 0.15,
    problemsSolved:       0.10,
  },
  atcoder: {
    currentRating:        0.50, // Single clearest signal
    maxRating:            0.20,
    contestsParticipated: 0.20,
    winCount:             0.10, // Times ranked 1st — rare, extremely prestigious
  },
  hackerrank: {
    overallScore:        0.40, // HackerRank's own skill score
    certifications:      0.35, // Gold/Silver/Bronze badges with verifiable difficulty
    problemsSolved:      0.25,
  },
  hackerearth: {
    currentRating:   0.50,
    problemsSolved:  0.30,
    contestsEntered: 0.20,
  },
  topcoder: {
    algorithmRating:  0.55, // SRM rating — oldest and most battle-tested CP rating
    maxRating:        0.20,
    contestsEntered:  0.25,
  },
  gfg: {
    practiceScore:    0.45,
    problemsSolved:   0.35,
    codingStreak:     0.20,
  },
  github: {
    totalMergedPRs:       0.30, // Real-world engineering output — strongest signal
    totalCommitsLastYear: 0.20, // Activity & consistency
    totalStarsEarned:     0.18, // Impact — capped to avoid viral outlier distortion
    totalReviewsLastYear: 0.12, // Collaboration quality
    totalContribDays:     0.10, // Consistency (days with at least 1 contribution)
    accountAgeFactor:     0.10, // Long-term commitment signal
  },
};

// ─── Recency Config ───────────────────────────────────────────────────────────
export const RECENCY_CONFIG = {
  MIN_FACTOR:  0.70, // Inactive floor — ghost profiles can't hold top spots forever
  DECAY_RATE:  0.12, // How fast full credit is earned with active months
  // recency = MIN + (1 - MIN) * (1 - e^(-DECAY * active_months))
  // 12 active months → ~0.97 | 6 active months → ~0.87 | 0 active months → 0.70
};

// ─── Confidence Config ────────────────────────────────────────────────────────
// Fewer data points = wider uncertainty band on final score
export const CONFIDENCE_CONFIG = {
  MIN_CONTESTS_FULL_CONFIDENCE:  10,  // ≥10 contests → full confidence
  MIN_PROBLEMS_FULL_CONFIDENCE:  50,  // ≥50 problems → full confidence
  CONFIDENCE_FLOOR:             0.80, // Min confidence multiplier (very new user)
};

// ─── Difficulty Weighting ─────────────────────────────────────────────────────
// Continuous weight for Codeforces problems: w = 1 + (rating/800)^1.5
// This is more precise than discrete buckets used in v1
export function continuousDifficultyWeight(problemRating: number): number {
  if (problemRating <= 0) return 1.0;
  return 1.0 + Math.pow(problemRating / 800, 1.5);
}

// ─── Platform Tier Labels (for UI) ───────────────────────────────────────────
export const PLATFORM_TIERS: Record<Platform, string> = {
  codeforces:  "S-Tier — Elite Competitive Programming",
  leetcode:    "S-Tier — Industry Interview Standard",
  github:      "S-Tier — Real Engineering Output",
  codechef:    "A-Tier — Major CP Platform",
  atcoder:     "A-Tier — Highest Problem Quality",
  hackerrank:  "B-Tier — Broad Skill Certification",
  topcoder:    "B-Tier — Pioneer CP Platform",
  hackerearth: "C-Tier — Practice & Hiring",
  gfg:         "C-Tier — Practice & Interview Prep",
};

// ─── Prestige Multipliers ─────────────────────────────────────────────────────
// CF and LC ratings are the most universally respected signals in software hiring.
// A CF rating of 1900 (Candidate Master) or LC contest rating of 2000 is something
// the entire industry recognises. We apply a small prestige multiplier to these two
// platforms' RATING metrics specifically — not to all their metrics — to reflect this.
//
// Applied only to: CF currentRating, CF maxRating, LC contestRating
// Effect: a top-rated CF/LC user gets slightly more score on those specific metrics
// than someone equally percentile-ranked on a less prestigious platform.
// This is additive boost capped at +10% on the metric — not unbounded.
export const PRESTIGE_BOOST: Partial<Record<string, number>> = {
  // Values are MAX ADDITIVE BONUS POINTS (K), not multipliers.
  // Applied as: pr_final = pr_raw + K × (1 - pr_raw/100)
  // This tapers at the top — a 90th PR gets +0.8K, a 99th PR gets +0.01K.
  // Elite users are SEPARATED not compressed. Low scorers still get small boost.
  "codeforces:currentRating": 8,    // Up to +8 points — world's most respected CP rating
  "codeforces:maxRating":     5,    // Up to +5 points — career peak signal
  "leetcode:contestRating":   6,    // Up to +6 points — most-checked interview signal
};
