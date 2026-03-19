import { PlatformName } from "../../models/schema";
import { continuousDifficultyWeight, CONFIDENCE_CONFIG } from "./weights";

export type PlatformMetrics = Record<string, number>;

// ─── Codeforces ────────────────────────────────────────────────────────────────
export function extractCodeforcesMetrics(data: any): PlatformMetrics {
  // v2: use continuous difficulty weight instead of discrete buckets
  let weightedProblemScore = 0;
  for (const [ratingStr, count] of Object.entries(data.problemsSolvedByRating ?? {})) {
    const r = Number(ratingStr);
    weightedProblemScore += (count as number) * continuousDifficultyWeight(r);
  }

  return {
    currentRating:        data.userInfo?.rating ?? 0,
    maxRating:            data.userInfo?.maxRating ?? 0,
    weightedProblemScore,
    contestsParticipated: data.contestsParticipated ?? 0,
    contributionScore:    Math.max(0, data.userInfo?.contribution ?? 0),
  };
}

// ─── LeetCode ─────────────────────────────────────────────────────────────────
export function extractLeetCodeMetrics(data: any): PlatformMetrics {
  const totalSolved = data.totalSolved ?? 0;
  const totalSubmissions = data.totalSubmissions ?? 1;
  return {
    contestRating:    data.contestRating ?? 0,
    hardSolved:       data.hardSolved ?? 0,
    mediumSolved:     data.mediumSolved ?? 0,
    attendedContests: data.attendedContests ?? 0,
    acceptanceRate:   totalSolved / totalSubmissions,
  };
}

// ─── CodeChef ─────────────────────────────────────────────────────────────────
export function extractCodeChefMetrics(data: any): PlatformMetrics {
  return {
    currentRating:        data.currentRating ?? 0,
    maxRating:            data.maxRating ?? 0,
    stars:                data.stars ?? 0,
    contestsParticipated: data.contestsParticipated ?? 0,
    problemsSolved:       data.problemsSolved ?? 0,
  };
}

// ─── AtCoder ──────────────────────────────────────────────────────────────────
export function extractAtCoderMetrics(data: any): PlatformMetrics {
  return {
    currentRating:        data.rating ?? 0,
    maxRating:            data.maxRating ?? 0,
    contestsParticipated: data.contestsParticipated ?? 0,
    winCount:             data.winCount ?? 0,
  };
}

// ─── HackerRank ───────────────────────────────────────────────────────────────
export function extractHackerRankMetrics(data: any): PlatformMetrics {
  // Weighted badge score: sum of (stars * weight by badge tier)
  const certWeight = (data.certifications ?? []).length * 15;
  return {
    overallScore:   data.overallScore ?? 0,
    certifications: certWeight,
    problemsSolved: data.problemsSolved ?? 0,
  };
}

// ─── HackerEarth ──────────────────────────────────────────────────────────────
export function extractHackerEarthMetrics(data: any): PlatformMetrics {
  return {
    currentRating:   data.currentRating ?? 0,
    problemsSolved:  data.problemsSolved ?? 0,
    contestsEntered: data.contestsEntered ?? 0,
  };
}

// ─── TopCoder ─────────────────────────────────────────────────────────────────
export function extractTopCoderMetrics(data: any): PlatformMetrics {
  return {
    algorithmRating:  data.algorithmRating ?? 0,
    maxRating:        data.maxRating ?? 0,
    contestsEntered:  data.contestsEntered ?? 0,
  };
}

// ─── GFG ──────────────────────────────────────────────────────────────────────
export function extractGFGMetrics(data: any): PlatformMetrics {
  return {
    practiceScore:  data.practiceScore ?? 0,
    problemsSolved: data.problemsSolved ?? 0,
    codingStreak:   data.codingStreak ?? 0,
  };
}

// ─── GitHub ───────────────────────────────────────────────────────────────────
export function extractGitHubMetrics(data: any): PlatformMetrics {
  // Cap stars at 10K to prevent one viral repo from dominating
  const cappedStars = Math.min(data.totalStarsEarned ?? 0, 10000);
  // Account age factor: 0→0, 3yr→0.5, 7yr+→1.0 (diminishing returns)
  const ageDays = data.accountAgeDays ?? 0;
  const accountAgeFactor = Math.min(1.0, ageDays / (7 * 365));

  return {
    totalMergedPRs:       data.totalMergedPRs ?? 0,
    totalCommitsLastYear: data.totalCommitsLastYear ?? 0,
    totalStarsEarned:     cappedStars,
    totalReviewsLastYear: data.totalReviewsLastYear ?? 0,
    totalContribDays:     data.totalContributionDays ?? 0,
    accountAgeFactor:     accountAgeFactor * 100, // scale to 0–100 for percentile
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
export function extractMetrics(platform: PlatformName, rawData: any): PlatformMetrics {
  switch (platform) {
    case "codeforces":  return extractCodeforcesMetrics(rawData);
    case "leetcode":    return extractLeetCodeMetrics(rawData);
    case "codechef":    return extractCodeChefMetrics(rawData);
    case "atcoder":     return extractAtCoderMetrics(rawData);
    case "hackerrank":  return extractHackerRankMetrics(rawData);
    case "hackerearth": return extractHackerEarthMetrics(rawData);
    case "topcoder":    return extractTopCoderMetrics(rawData);
    case "gfg":         return extractGFGMetrics(rawData);
    case "github":      return extractGitHubMetrics(rawData);
    default:            throw new Error(`Unknown platform: ${platform}`);
  }
}

// ─── Confidence Score ─────────────────────────────────────────────────────────
/**
 * How confident are we in a user's platform score?
 * More contests/problems = higher confidence.
 * New users with 1-2 contests get a slight penalty — prevents gaming by new signups.
 */
export function computeConfidenceFactor(allMetrics: Partial<Record<PlatformName, PlatformMetrics>>): number {
  const { MIN_CONTESTS_FULL_CONFIDENCE, MIN_PROBLEMS_FULL_CONFIDENCE, CONFIDENCE_FLOOR } = CONFIDENCE_CONFIG;

  let totalContests = 0;
  let totalProblems = 0;

  for (const [platform, metrics] of Object.entries(allMetrics)) {
    if (!metrics) continue;
    totalContests += (metrics["contestsParticipated"] ?? 0) +
                     (metrics["attendedContests"] ?? 0) +
                     (metrics["contestsEntered"] ?? 0);
    totalProblems += (metrics["problemsSolved"] ?? 0) +
                     (metrics["hardSolved"] ?? 0) * 3 +
                     (metrics["mediumSolved"] ?? 0);
  }

  const contestConf = Math.min(1.0, totalContests / MIN_CONTESTS_FULL_CONFIDENCE);
  const problemConf = Math.min(1.0, totalProblems / MIN_PROBLEMS_FULL_CONFIDENCE);
  const rawConf = Math.max(contestConf, problemConf);

  return CONFIDENCE_FLOOR + (1 - CONFIDENCE_FLOOR) * rawConf;
}

// ─── Log-Transform Set ────────────────────────────────────────────────────────
// Applied to skewed metrics before percentile ranking to reduce outlier distortion
export const LOG_TRANSFORM_METRICS = new Set([
  "totalStarsEarned",
  "totalMergedPRs",
  "totalCommitsLastYear",
  "weightedProblemScore",
  "practiceScore",
  "overallScore",
]);
