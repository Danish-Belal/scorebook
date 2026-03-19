/**
 * Edge case tests for ScoreBook Scoring Engine v4.
 * Tests every real-world scenario identified in the full system audit.
 */

import { computeCompositeScore, PS_PLATFORMS } from "../../src/services/scoring/composite";
import { RECENCY_CONFIG } from "../../src/services/scoring/weights";
import { computeRecencyFactor } from "../../src/services/scoring/recency";
import { extractLeetCodeMetrics } from "../../src/services/scoring/metrics";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeCtx(N = 200, spread = 100) {
  const all = Array.from({ length: N }, (_, i) => (i / N) * spread);
  return { allValues: all, sortedValues: [...all] };
}

function buildContexts(platforms: string[], metrics: string[], N = 200) {
  const map = new Map<string, any>();
  for (const p of platforms)
    for (const m of metrics)
      map.set(`${p}:${m}`, makeCtx(N));
  return map;
}

const cfMetrics   = ["currentRating","maxRating","weightedProblemScore","contestsParticipated","contributionScore"];
const lcMetrics   = ["contestRating","hardSolved","mediumSolved","attendedContests","acceptanceRate"];
const ghMetrics   = ["totalMergedPRs","totalCommitsLastYear","totalStarsEarned","totalReviewsLastYear","totalContribDays","accountAgeFactor"];
const ccMetrics   = ["currentRating","maxRating","stars","contestsParticipated","problemsSolved"];
const acMetrics   = ["currentRating","maxRating","contestsParticipated","winCount"];

const fullCtx = new Map([
  ...buildContexts(["codeforces"], cfMetrics).entries(),
  ...buildContexts(["leetcode"],   lcMetrics).entries(),
  ...buildContexts(["github"],     ghMetrics).entries(),
  ...buildContexts(["codechef"],   ccMetrics).entries(),
  ...buildContexts(["atcoder"],    acMetrics).entries(),
]);

// Elite metrics — 90th percentile performance
const eliteCF = { currentRating: 90, maxRating: 92, weightedProblemScore: 88, contestsParticipated: 50, contributionScore: 70 };
const eliteLC = { contestRating: 90, hardSolved: 88, mediumSolved: 85, attendedContests: 30, acceptanceRate: 0.80 };

// Beginner metrics — 20th percentile
const beginCF = { currentRating: 20, maxRating: 22, weightedProblemScore: 18, contestsParticipated: 3, contributionScore: 5 };
const beginLC = { contestRating: 20, hardSolved: 5, mediumSolved: 20, attendedContests: 2, acceptanceRate: 0.40 };

// ─── SCENARIO 1: Single CF-only Grandmaster ───────────────────────────────────

describe("Scenario 1: CF-only elite user", () => {

  test("CF Grandmaster with 50+ contests gets high score — not dragged to 65", () => {
    const result = computeCompositeScore(
      { codeforces: eliteCF },
      fullCtx, 0.95, 1.0
    );
    // Before v4, this would be ~65. After v4, single dominant platform = full score.
    expect(result.finalScore).toBeGreaterThan(78);
    expect(result.fairness.dominantPlatform).toBe("codeforces");
    console.log(`CF-only Grandmaster final score: ${result.finalScore}`);
  });

  test("CF-only user's PS score equals their CF score", () => {
    const result = computeCompositeScore(
      { codeforces: eliteCF },
      fullCtx, 1.0, 1.0
    );
    const cfPlatformScore = result.platformScores.find(p => p.platform === "codeforces" && p.connected)?.platformScore ?? 0;
    // PS score should be very close to CF score (prestige boost may add tiny amount)
    expect(Math.abs(result.psScore - cfPlatformScore)).toBeLessThan(5);
  });

  test("CF-only beginner with only 3 contests does NOT dominate — uses confidence blend", () => {
    const result = computeCompositeScore(
      { codeforces: beginCF },
      fullCtx, 0.80, 0.80
    );
    // beginCF has 3 contests — below MIN_CONTESTS_FOR_ESTIMATION(5)
    // Should NOT be dominant mode — uses confidence blend with 50
    expect(result.fairness.dominantPlatform).toBeNull();
  });

  test("CF-only user gets meaningful titles", () => {
    const result = computeCompositeScore(
      { codeforces: eliteCF },
      fullCtx, 1.0, 1.0,
      { codeforces: { rank: 3, total: 500 } }
    );
    expect(result.titles.length).toBeGreaterThan(0);
    const cfTitle = result.titles.find(t => t.platform === "codeforces");
    expect(cfTitle).toBeDefined();
    expect(cfTitle!.rank).toBe(3);
  });

  test("CF-only user gets a potential score pointing to LC", () => {
    const result = computeCompositeScore(
      { codeforces: eliteCF },
      fullCtx, 1.0, 1.0
    );
    expect(result.potentialScore).not.toBeNull();
    expect(result.potentialNote).toContain("LeetCode");
  });
});

// ─── SCENARIO 2: LC-only expert ───────────────────────────────────────────────

describe("Scenario 2: LC-only expert user", () => {

  test("LC-only user with 300 hard solved gets high score", () => {
    const lcHeavy = { ...eliteLC, hardSolved: 300, attendedContests: 40 };
    const result = computeCompositeScore(
      { leetcode: lcHeavy },
      fullCtx, 0.95, 1.0
    );
    expect(result.finalScore).toBeGreaterThan(75);
    expect(result.fairness.dominantPlatform).toBe("leetcode");
  });

  test("LC-only user outranks a 9-platform average user", () => {
    const lcExpert = { ...eliteLC, hardSolved: 200, attendedContests: 25 };
    const avgAllPlatforms = {
      codeforces: { currentRating: 50, maxRating: 52, weightedProblemScore: 48, contestsParticipated: 20, contributionScore: 30 },
      leetcode:   { contestRating: 50, hardSolved: 45, mediumSolved: 55, attendedContests: 15, acceptanceRate: 0.55 },
      github:     { totalMergedPRs: 50, totalCommitsLastYear: 50, totalStarsEarned: 45, totalReviewsLastYear: 48, totalContribDays: 52, accountAgeFactor: 55 },
    };

    const lcOnly = computeCompositeScore({ leetcode: lcExpert }, fullCtx, 0.95, 1.0);
    const avg    = computeCompositeScore(avgAllPlatforms as any, fullCtx, 0.95, 1.0);

    expect(lcOnly.finalScore).toBeGreaterThan(avg.finalScore);
    console.log(`LC-only expert: ${lcOnly.finalScore}, avg 3-platform: ${avg.finalScore}`);
  });
});

// ─── SCENARIO 3: Prestige boost is additive, not compressive ─────────────────

describe("Scenario 3: Prestige boost correctness", () => {

  test("Top 1% CF user gets higher score than top 5% CF user (not compressed together)", () => {
    const cf99 = { ...eliteCF, currentRating: 99 }; // ~99th PR
    const cf94 = { ...eliteCF, currentRating: 94 }; // ~94th PR

    const r99 = computeCompositeScore({ codeforces: cf99 }, fullCtx, 1.0, 1.0);
    const r94 = computeCompositeScore({ codeforces: cf94 }, fullCtx, 1.0, 1.0);

    // They should be distinct — not compressed to the same score
    expect(r99.finalScore).toBeGreaterThan(r94.finalScore);
    expect(r99.finalScore - r94.finalScore).toBeGreaterThan(1); // At least 1 point apart
  });

  test("No score exceeds 100 even with max prestige boost", () => {
    const cf100 = { ...eliteCF, currentRating: 100, maxRating: 100 };
    const result = computeCompositeScore({ codeforces: cf100 }, fullCtx, 1.0, 1.0);
    expect(result.finalScore).toBeLessThanOrEqual(100);
    for (const p of result.platformScores) {
      for (const m of p.metrics) {
        expect(m.percentileRank).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ─── SCENARIO 4: No-context users (first users on platform) ──────────────────

describe("Scenario 4: First user on a platform (empty context)", () => {

  const emptyCtx = new Map<string, any>(); // No other users

  test("First CF user with elite rating gets high score, not 50", () => {
    const result = computeCompositeScore(
      { codeforces: eliteCF },
      emptyCtx, 1.0, 1.0
    );
    // Should get ~100 on all metrics (first user = rank 1 by default)
    expect(result.psScore).toBeGreaterThan(80);
  });

  test("First user with 0 rating gets ~0 score, not 50", () => {
    const zeroMetrics = { currentRating: 0, maxRating: 0, weightedProblemScore: 0, contestsParticipated: 0, contributionScore: 0 };
    const result = computeCompositeScore(
      { codeforces: zeroMetrics },
      emptyCtx, 0.70, 0.80
    );
    expect(result.psScore).toBeLessThan(20);
  });
});

// ─── SCENARIO 5: Weight redistribution is proportional ───────────────────────

describe("Scenario 5: Weight redistribution", () => {

  test("Missing GitHub weight goes proportionally to PS and BR, not just PS", () => {
    const withGFG = computeCompositeScore(
      { codeforces: eliteCF, gfg: { practiceScore: 60, problemsSolved: 55, codingStreak: 40 } },
      fullCtx, 1.0, 1.0
    );
    // psWeight + brWeight should sum to ~1.0 (no ENG)
    const totalW = withGFG.psWeight + withGFG.engWeight + withGFG.brWeight;
    expect(totalW).toBeCloseTo(1.0, 2);
    expect(withGFG.engWeight).toBe(0);
    expect(withGFG.brWeight).toBeGreaterThan(0);
  });

  test("All weights always sum to exactly 1.0", () => {
    const cases = [
      {},
      { codeforces: eliteCF },
      { codeforces: eliteCF, leetcode: eliteLC },
      { codeforces: eliteCF, leetcode: eliteLC, github: { totalMergedPRs: 60, totalCommitsLastYear: 65, totalStarsEarned: 40, totalReviewsLastYear: 55, totalContribDays: 60, accountAgeFactor: 50 } },
    ];
    for (const m of cases) {
      const r = computeCompositeScore(m as any, fullCtx, 0.9, 0.9);
      expect(r.psWeight + r.engWeight + r.brWeight).toBeCloseTo(1.0, 2);
    }
  });
});

// ─── SCENARIO 6: LeetCode acceptanceRate normalisation ───────────────────────

describe("Scenario 6: LeetCode acceptanceRate normalisation", () => {

  test("acceptanceRate above 1 is normalised to 0-1 range", () => {
    const rawData = { contestRating: 1800, hardSolved: 100, mediumSolved: 300, totalSolved: 450, totalSubmissions: 600, attendedContests: 20, streak: 50 };
    // Simulate fetcher returning acceptanceRate as percentage (72)
    const dataWithPct = { ...rawData, acceptanceRate: 72 };
    const metrics = extractLeetCodeMetrics(dataWithPct);
    expect(metrics.acceptanceRate).toBeLessThanOrEqual(1.0);
    expect(metrics.acceptanceRate).toBeCloseTo(0.72, 2);
  });

  test("acceptanceRate already 0-1 stays unchanged", () => {
    const rawData = { contestRating: 1800, hardSolved: 100, mediumSolved: 300, totalSolved: 450, totalSubmissions: 600, attendedContests: 20, streak: 50, acceptanceRate: 0.72 };
    const metrics = extractLeetCodeMetrics(rawData);
    expect(metrics.acceptanceRate).toBeCloseTo(0.72, 2);
  });
});

// ─── SCENARIO 7: Score always in valid range ──────────────────────────────────

describe("Scenario 7: Score bounds and invariants", () => {

  test("finalScore is always in [0, 100]", () => {
    const cases = [
      {}, { codeforces: eliteCF }, { leetcode: eliteLC },
      { codeforces: eliteCF, leetcode: eliteLC },
      { codeforces: beginCF, leetcode: beginLC },
    ];
    for (const m of cases) {
      const r = computeCompositeScore(m as any, fullCtx, 0.7, 0.8);
      expect(r.finalScore).toBeGreaterThanOrEqual(0);
      expect(r.finalScore).toBeLessThanOrEqual(100);
      expect(r.scoreLower).toBeLessThanOrEqual(r.finalScore);
      expect(r.scoreUpper).toBeGreaterThanOrEqual(r.finalScore);
    }
  });

  test("scoreLower is always ≤ finalScore ≤ scoreUpper", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, fullCtx, 0.85, 0.90);
    expect(r.scoreLower).toBeLessThanOrEqual(r.finalScore);
    expect(r.scoreUpper).toBeGreaterThanOrEqual(r.finalScore);
  });

  test("all metric percentileRanks are in [0, 100]", () => {
    const r = computeCompositeScore({ codeforces: eliteCF, leetcode: eliteLC }, fullCtx, 1.0, 1.0);
    for (const p of r.platformScores) {
      for (const m of p.metrics) {
        expect(m.percentileRank).toBeGreaterThanOrEqual(0);
        expect(m.percentileRank).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ─── SCENARIO 8: Recency — CodeChef fix ──────────────────────────────────────

describe("Scenario 8: Recency CodeChef fix", () => {

  test("CodeChef user with 100 old contests does not get 12 active months", () => {
    const factor = computeRecencyFactor({
      codechef: { contestsParticipated: 100 }
    } as any);
    // Should only count 1 month (conservative), not 50 months
    // With 1 active month: factor = 0.70 + 0.30*(1-e^(-0.12*1)) ≈ 0.734
    expect(factor).toBeLessThan(0.78);
    expect(factor).toBeGreaterThanOrEqual(RECENCY_CONFIG.MIN_FACTOR);
  });

  test("Active Codeforces user with recent contests gets high recency", () => {
    const now = Date.now();
    const ratingHistory = Array.from({ length: 12 }, (_, i) => ({
      ratingUpdateTimeSeconds: Math.floor((now - i * 25 * 24 * 3600 * 1000) / 1000),
      oldRating: 1800, newRating: 1820,
    }));
    const factor = computeRecencyFactor({
      codeforces: { ratingHistory }
    } as any);
    expect(factor).toBeGreaterThan(0.92);
  });
});

// ─── SCENARIO 9: No-platform edge case ───────────────────────────────────────

describe("Scenario 9: User with no platforms", () => {
  test("Empty user gets score ~0, not 50", () => {
    const r = computeCompositeScore({}, fullCtx, 0.70, 0.80);
    expect(r.finalScore).toBeLessThan(10);
    expect(r.psScore).toBe(0);
    expect(r.fairness.platformsConnected).toBe(0);
  });
});
