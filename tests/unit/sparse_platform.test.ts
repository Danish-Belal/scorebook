/**
 * Tests for sparse-platform edge cases in scoring engine v3.
 * These tests verify the exact scenarios described in the design doc.
 */

import { computeCompositeScore, PS_PLATFORMS, ENG_PLATFORMS } from "../../src/services/scoring/composite";
import { AllPercentileContexts } from "../../src/services/scoring/composite";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake percentile context where every user has values 0–100 evenly */
function makeUniformContext(N = 100): import("../../src/services/scoring/percentile").PercentileContext {
  const allValues    = Array.from({ length: N }, (_, i) => i);
  const sortedValues = [...allValues];
  return { allValues, sortedValues };
}

/** Build contexts for all metrics of a given platform with uniform distribution */
function contextsForPlatform(platform: string, metrics: string[], N = 200): AllPercentileContexts {
  const map = new Map<string, any>();
  for (const m of metrics) {
    map.set(`${platform}:${m}`, makeUniformContext(N));
  }
  return map;
}

/** Build full contexts for standard platforms */
function buildFullContexts(N = 200): AllPercentileContexts {
  const map = new Map<string, any>();
  const ctx = makeUniformContext(N);

  // CF metrics
  for (const m of ["currentRating","maxRating","weightedProblemScore","contestsParticipated","contributionScore"])
    map.set(`codeforces:${m}`, ctx);
  // LC metrics
  for (const m of ["contestRating","hardSolved","mediumSolved","attendedContests","acceptanceRate"])
    map.set(`leetcode:${m}`, ctx);
  // GitHub metrics
  for (const m of ["totalMergedPRs","totalCommitsLastYear","totalStarsEarned","totalReviewsLastYear","totalContribDays","accountAgeFactor"])
    map.set(`github:${m}`, ctx);
  // GFG
  for (const m of ["practiceScore","problemsSolved","codingStreak"])
    map.set(`gfg:${m}`, ctx);

  return map;
}

// Elite CF+LC metrics (top 90th percentile values in a 0–100 uniform distribution)
const eliteCFMetrics   = { currentRating: 90, maxRating: 92, weightedProblemScore: 88, contestsParticipated: 85, contributionScore: 70 };
const eliteLCMetrics   = { contestRating: 90, hardSolved: 88, mediumSolved: 85, attendedContests: 80, acceptanceRate: 0.80 };
// Average metrics across all platforms (~55th percentile)
const avgMetrics       = { currentRating: 55, maxRating: 57, weightedProblemScore: 54, contestsParticipated: 52, contributionScore: 50 };
const avgLCMetrics     = { contestRating: 55, hardSolved: 50, mediumSolved: 55, attendedContests: 52, acceptanceRate: 0.55 };
const avgGHMetrics     = { totalMergedPRs: 55, totalCommitsLastYear: 55, totalStarsEarned: 50, totalReviewsLastYear: 52, totalContribDays: 53, accountAgeFactor: 60 };
const avgGFGMetrics    = { practiceScore: 58, problemsSolved: 55, codingStreak: 50 };

const ctx  = buildFullContexts(200);

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Sparse Platform Edge Cases — v3 Scoring Engine", () => {

  // ── BUG 1 FIX: Elite 2-platform user should outrank average 9-platform user ─

  test("Elite CF+LC user outranks average 9-platform user", () => {
    const eliteUser = computeCompositeScore(
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics },
      ctx, 0.95, 1.0
    );

    const avgUser = computeCompositeScore(
      {
        codeforces: avgMetrics,   leetcode: avgLCMetrics,
        github: avgGHMetrics,     gfg: avgGFGMetrics,
        // other platforms at ~55th percentile
      },
      ctx, 0.95, 1.0
    );

    expect(eliteUser.finalScore).toBeGreaterThan(avgUser.finalScore);
    console.log(`Elite 2-platform: ${eliteUser.finalScore} vs Avg 9-platform: ${avgUser.finalScore}`);
  });

  // ── BUG 2 FIX: PS weight absorbs missing components correctly ────────────────

  test("Missing GitHub pushes weight to PS, not penalised", () => {
    const withoutGH = computeCompositeScore(
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics },
      ctx, 1.0, 1.0
    );

    expect(withoutGH.engWeight).toBe(0);
    expect(withoutGH.psWeight).toBeCloseTo(0.9, 2); // 65% + 25% = 90%
    expect(withoutGH.fairness.engineeringIncluded).toBe(false);
    expect(withoutGH.fairness.note).toContain("GitHub not connected");
  });

  test("With GitHub connected, engineering has 25% weight", () => {
    const withGH = computeCompositeScore(
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics, github: avgGHMetrics },
      ctx, 1.0, 1.0
    );

    expect(withGH.engWeight).toBeCloseTo(0.25, 2);
    expect(withGH.psWeight).toBeCloseTo(0.65, 2);
    expect(withGH.fairness.engineeringIncluded).toBe(true);
  });

  // ── BUG 3 FIX: Missing PS platforms estimated from user's own average ────────

  test("Missing PS platforms estimated from own PS average when ≥2 platforms", () => {
    const user = computeCompositeScore(
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics }, // CF+LC only
      ctx, 1.0, 1.0
    );

    // Should estimate codechef, atcoder, topcoder
    expect(user.fairness.estimatedPlatforms).toContain("codechef");
    expect(user.fairness.estimatedPlatforms).toContain("atcoder");
    expect(user.fairness.estimatedPlatforms).toContain("topcoder");

    // Estimated platform score should be approximately their PS average
    const estimatedPlatformScore = user.platformScores.find(p => p.platform === "codechef" && p.estimated);
    expect(estimatedPlatformScore).toBeDefined();

    // The estimated score should NOT be 0 or 50 (pool median)
    expect(estimatedPlatformScore!.platformScore).toBeGreaterThan(70); // They're elite
    console.log(`Estimated CodeChef score for elite user: ${estimatedPlatformScore!.platformScore}`);
  });

  test("Only 1 PS platform → missing PS platforms default to pool median (50), not estimated", () => {
    const user = computeCompositeScore(
      { codeforces: eliteCFMetrics }, // CF only — not enough to extrapolate
      ctx, 1.0, 1.0
    );

    const estimatedLC = user.platformScores.find(p => p.platform === "leetcode" && p.estimated);
    expect(estimatedLC).toBeDefined();
    // Should be 50 (pool median), not extrapolated from 1 platform
    expect(estimatedLC!.platformScore).toBe(50);
  });

  // ── BUG 4 FIX: Pure CP developer not penalised for no GitHub ─────────────────

  test("Pure CP developer (no GitHub) can reach high score", () => {
    const cpDev = computeCompositeScore(
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics },
      ctx, 0.95, 1.0
    );

    // Should be able to get a high score — not capped because GitHub missing
    expect(cpDev.finalScore).toBeGreaterThan(70);
    expect(cpDev.psWeight).toBeCloseTo(0.9, 1); // PS gets 90%
  });

  // ── Fairness: PS average used for estimates, not pool median ─────────────────

  test("Elite user's estimated platforms are higher than pool median", () => {
    const eliteUser = computeCompositeScore(
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics },
      ctx, 1.0, 1.0
    );

    // All estimated PS platforms should be above 50 (pool median)
    for (const p of eliteUser.platformScores.filter(x => x.estimated)) {
      expect(p.platformScore).toBeGreaterThan(50);
    }
  });

  test("Below-average user's estimated platforms are below pool median", () => {
    const weakMetrics = { currentRating: 20, maxRating: 22, weightedProblemScore: 18, contestsParticipated: 15, contributionScore: 10 };
    const weakLCMetrics = { contestRating: 20, hardSolved: 15, mediumSolved: 20, attendedContests: 18, acceptanceRate: 0.30 };

    const weakUser = computeCompositeScore(
      { codeforces: weakMetrics, leetcode: weakLCMetrics },
      ctx, 1.0, 1.0
    );

    for (const p of weakUser.platformScores.filter(x => x.estimated)) {
      expect(p.platformScore).toBeLessThan(50);
    }
  });

  // ── Edge: user with 0 connected platforms ────────────────────────────────────

  test("User with no platforms gets score ~0 and no errors", () => {
    const emptyUser = computeCompositeScore({}, ctx, 0.7, 0.8);
    expect(emptyUser.finalScore).toBeGreaterThanOrEqual(0);
    expect(emptyUser.finalScore).toBeLessThanOrEqual(10);
    expect(emptyUser.fairness.platformsConnected).toBe(0);
  });

  // ── Breadth weight flows to PS if no breadth platforms ───────────────────────

  test("BR weight flows to PS when no breadth platforms connected", () => {
    const user = computeCompositeScore(
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics, github: avgGHMetrics },
      ctx, 1.0, 1.0
    );

    expect(user.brWeight).toBe(0);
    expect(user.brScore).toBeNull();
    // PS + ENG should sum to 1.0
    expect(user.psWeight + user.engWeight).toBeCloseTo(1.0, 2);
  });

  // ── Score is always in [0, 100] ───────────────────────────────────────────────

  test("Final score is always between 0 and 100 for any combination", () => {
    const cases = [
      {},
      { codeforces: eliteCFMetrics },
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics },
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics, github: avgGHMetrics },
      { codeforces: eliteCFMetrics, leetcode: eliteLCMetrics, github: avgGHMetrics, gfg: avgGFGMetrics },
    ];

    for (const metrics of cases) {
      const result = computeCompositeScore(metrics as any, ctx, 0.9, 0.9);
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
      expect(result.psWeight + result.engWeight + result.brWeight).toBeCloseTo(1.0, 2);
    }
  });
});
