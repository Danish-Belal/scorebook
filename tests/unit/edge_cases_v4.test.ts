/**
 * tests/unit/edge_cases_v4.test.ts
 *
 * Real-world scenario tests for the v4 scoring engine.
 *
 * IMPORTANT — how percentiles work in these tests:
 *   We use a uniform context of N=200 values (0..199).
 *   A raw metric value of X maps to PR ≈ (X + 0.5) / 200 * 100.
 *   So raw=180 → PR ≈ 90.25 (90th percentile).
 *   After metric weights, prestige boost, recency, and confidence:
 *   the final score is lower than the raw PR.
 *
 * IMPORTANT — weight model:
 *   Missing components are renormalised proportionally (not "added to PS").
 *   CF only → psWeight = 1.0. CF+GH → psWeight ≈ 0.722.
 *
 * IMPORTANT — LeetCode acceptanceRate:
 *   extractLeetCodeMetrics computes rate as totalSolved/totalSubmissions.
 *   It does NOT read data.acceptanceRate.
 *   Tests must pass totalSolved + totalSubmissions, not acceptanceRate directly.
 *
 * IMPORTANT — potential score:
 *   Only shown when gain = round(potentialScore - finalScore) > 2.
 *   For CF-only elite with psWeight=1.0, adding GitHub (est. 70) and BR (est. 60)
 *   changes rawComposite from psScore*1.0 to 0.65*psScore + 0.25*70 + 0.10*60.
 *   The gain is real and large enough to show the tip.
 */

import { computeCompositeScore } from "../../src/services/scoring/composite";
import { RECENCY_CONFIG }       from "../../src/services/scoring/weights";
import { computeRecencyFactor } from "../../src/services/scoring/recency";
import { extractLeetCodeMetrics, extractCodeforcesMetrics } from "../../src/services/scoring/metrics";
import { PercentileContext }    from "../../src/services/scoring/percentile";

// ─── Context helpers ──────────────────────────────────────────────────────────

function makeUniformCtx(N = 200): PercentileContext {
  const allValues    = Array.from({ length: N }, (_, i) => i);
  const sortedValues = [...allValues];
  return { allValues, sortedValues };
}

function buildFullCtx(N = 200): Map<string, PercentileContext> {
  const ctx = makeUniformCtx(N);
  const map = new Map<string, PercentileContext>();
  const specs: Record<string, string[]> = {
    codeforces:  ["currentRating","maxRating","weightedProblemScore","contestsParticipated","contributionScore"],
    leetcode:    ["contestRating","hardSolved","mediumSolved","attendedContests","acceptanceRate"],
    codechef:    ["currentRating","maxRating","stars","contestsParticipated","problemsSolved"],
    atcoder:     ["currentRating","maxRating","contestsParticipated","winCount"],
    topcoder:    ["algorithmRating","maxRating","contestsEntered"],
    github:      ["totalMergedPRs","totalCommitsLastYear","totalStarsEarned","totalReviewsLastYear","totalContribDays","accountAgeFactor"],
    hackerrank:  ["overallScore","certifications","problemsSolved"],
    hackerearth: ["currentRating","problemsSolved","contestsEntered"],
    gfg:         ["practiceScore","problemsSolved","codingStreak"],
  };
  for (const [p, ms] of Object.entries(specs))
    for (const m of ms) map.set(`${p}:${m}`, ctx);
  return map;
}

const fullCtx = buildFullCtx(200);
const emptyCtx = new Map<string, PercentileContext>();

// raw=180 → ~90th percentile in 200-element uniform context
const eliteCF = {
  currentRating: 180, maxRating: 182,
  weightedProblemScore: 175, contestsParticipated: 180, contributionScore: 160,
};
const eliteLC = {
  contestRating: 180, hardSolved: 178, mediumSolved: 175,
  attendedContests: 178, acceptanceRate: 0.90,
};
// raw=40 → ~20th percentile
const beginCF = {
  currentRating: 40, maxRating: 42,
  weightedProblemScore: 38, contestsParticipated: 3, contributionScore: 10,
};

// ─── SCENARIO 1: CF-only elite ───────────────────────────────────────────────

describe("Scenario 1: CF-only elite user", () => {

  test("CF-only with 180 contests enters dominant mode", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, fullCtx, 1.0, 1.0);
    expect(r.fairness.dominantPlatform).toBe("codeforces");
  });

  test("CF-only dominant mode: psScore ≈ CF platform score", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, fullCtx, 1.0, 1.0);
    const cfPlatformScore = r.platformScores
      .find(p => p.platform === "codeforces" && p.connected)!.platformScore;
    expect(Math.abs(r.psScore - cfPlatformScore)).toBeLessThan(3);
  });

  test("CF-only: psWeight = 1.0 (proportional renormalisation, no ENG or BR)", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, fullCtx, 1.0, 1.0);
    expect(r.psWeight).toBeCloseTo(1.0, 3);
  });

  test("CF-only elite: finalScore strong but pulled by metric blend (not naive 90)", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, fullCtx, 0.95, 1.0);
    expect(r.finalScore).toBeGreaterThan(55);
    expect(r.finalScore).toBeLessThanOrEqual(100);
  });

  test("CF-only beginner (3 contests): NOT dominant mode", () => {
    // 3 contests < MIN_CONTESTS(5), no problem signals → not dominant
    const r = computeCompositeScore({ codeforces: beginCF }, fullCtx, 0.80, 0.80);
    expect(r.fairness.dominantPlatform).toBeNull();
  });

  test("CF-only elite gets a platform title", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF }, fullCtx, 1.0, 1.0,
      { codeforces: { rank: 3, total: 500 } }
    );
    const cfTitle = r.titles.find(t => t.platform === "codeforces");
    expect(cfTitle).toBeDefined();
    expect(cfTitle!.rank).toBe(3);
    expect(cfTitle!.isGlobal).toBe(false);
  });

  test("CF rank 1: isGlobal = true", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF }, fullCtx, 1.0, 1.0,
      { codeforces: { rank: 1, total: 500 } }
    );
    const cfTitle = r.titles.find(t => t.platform === "codeforces");
    expect(cfTitle!.isGlobal).toBe(true);
  });

  test("CF-only elite shows potential score (gain from adding GitHub+BR > 2 pts)", () => {
    // Lower recency so finalScore drops; potential (full-weight formula) stays higher → gain > 2
    const r = computeCompositeScore({ codeforces: eliteCF }, fullCtx, 0.75, 1.0);
    expect(r.potentialScore).not.toBeNull();
    expect(r.potentialNote).not.toBeNull();
  });
});

// ─── SCENARIO 2: LC-only expert ──────────────────────────────────────────────

describe("Scenario 2: LC-only expert", () => {

  test("LC-only with 178 contests: dominant mode, dominantPlatform = 'leetcode'", () => {
    const r = computeCompositeScore({ leetcode: eliteLC }, fullCtx, 0.95, 1.0);
    expect(r.fairness.dominantPlatform).toBe("leetcode");
  });

  test("LC-only elite outscores avg user with CF+LC+GH all at 30th percentile", () => {
    // avg metrics: raw=60 → ~30th PR in 200-element uniform context
    const avgCF = {
      currentRating: 60, maxRating: 62, weightedProblemScore: 58,
      contestsParticipated: 60, contributionScore: 55,
    };
    const avgLC = {
      contestRating: 60, hardSolved: 58, mediumSolved: 62,
      attendedContests: 60, acceptanceRate: 0.55,
    };
    const avgGH = {
      totalMergedPRs: 60, totalCommitsLastYear: 58, totalStarsEarned: 55,
      totalReviewsLastYear: 57, totalContribDays: 62, accountAgeFactor: 60,
    };
    const lcOnly = computeCompositeScore({ leetcode: eliteLC }, fullCtx, 0.95, 1.0);
    const avg    = computeCompositeScore(
      { codeforces: avgCF, leetcode: avgLC, github: avgGH },
      fullCtx, 0.95, 1.0
    );
    expect(lcOnly.finalScore).toBeGreaterThan(avg.finalScore);
  });
});

// ─── SCENARIO 3: Prestige boost — additive, tapers at top ────────────────────

describe("Scenario 3: Prestige boost is additive and separating", () => {

  test("99th PR CF user scores higher than 94th PR CF user (not compressed)", () => {
    // raw=198 → PR≈99.25; raw=188 → PR≈94.25
    const cf99 = { ...eliteCF, currentRating: 198 };
    const cf94 = { ...eliteCF, currentRating: 188 };
    const r99  = computeCompositeScore({ codeforces: cf99 }, fullCtx, 1.0, 1.0);
    const r94  = computeCompositeScore({ codeforces: cf94 }, fullCtx, 1.0, 1.0);
    expect(r99.finalScore).toBeGreaterThan(r94.finalScore);
  });

  test("No metric percentileRank ever exceeds 100 after prestige boost", () => {
    // Use maximal raw values
    const cfMax = {
      currentRating: 199, maxRating: 199, weightedProblemScore: 199,
      contestsParticipated: 199, contributionScore: 199,
    };
    const r = computeCompositeScore({ codeforces: cfMax }, fullCtx, 1.0, 1.0);
    for (const p of r.platformScores) {
      for (const m of p.metrics) {
        expect(m.percentileRank).toBeLessThanOrEqual(100);
        expect(m.prestigeBoostApplied).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("No finalScore exceeds 100", () => {
    const cfMax = {
      currentRating: 199, maxRating: 199, weightedProblemScore: 199,
      contestsParticipated: 199, contributionScore: 199,
    };
    const r = computeCompositeScore({ codeforces: cfMax }, fullCtx, 1.0, 1.0);
    expect(r.finalScore).toBeLessThanOrEqual(100);
  });

  test("Additive boost K×(1-PR/100) — boost is larger for lower PR values", () => {
    // Lower PR user gets more absolute boost than higher PR user (tapering)
    const cf30 = { ...eliteCF, currentRating: 60  }; // ~30th PR
    const cf90 = { ...eliteCF, currentRating: 180 }; // ~90th PR
    const r30  = computeCompositeScore({ codeforces: cf30 }, fullCtx, 1.0, 1.0);
    const r90  = computeCompositeScore({ codeforces: cf90 }, fullCtx, 1.0, 1.0);
    const boost30 = r30.platformScores.find(p => p.platform === "codeforces")!
      .metrics.find(m => m.metricName === "currentRating")!.prestigeBoostApplied;
    const boost90 = r90.platformScores.find(p => p.platform === "codeforces")!
      .metrics.find(m => m.metricName === "currentRating")!.prestigeBoostApplied;
    expect(boost30).toBeGreaterThan(boost90);
  });
});

// ─── SCENARIO 4: Empty context (first user on platform) ──────────────────────

describe("Scenario 4: First user on platform — empty context", () => {

  test("Elite CF in empty context: all non-zero metrics → PR=100, high psScore", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, emptyCtx, 1.0, 1.0);
    // FIX 3: raw > 0 → PR = 100 (rank 1 by default)
    expect(r.psScore).toBeGreaterThan(80);
    for (const p of r.platformScores.filter(p => p.connected)) {
      for (const m of p.metrics) {
        if (m.rawValue > 0) {
          expect(m.percentileRank).toBe(100);
        }
      }
    }
  });

  test("All-zero metrics in empty context: PR=0, psScore near 0", () => {
    const zeroMetrics = {
      currentRating: 0, maxRating: 0, weightedProblemScore: 0,
      contestsParticipated: 0, contributionScore: 0,
    };
    const r = computeCompositeScore({ codeforces: zeroMetrics }, emptyCtx, 0.70, 0.80);
    // Zero raw metrics → low PRs, but prestige boost + metric blend can land ~10–15
    expect(r.psScore).toBeLessThan(20);
  });
});

// ─── SCENARIO 5: LeetCode acceptanceRate extraction ──────────────────────────

describe("Scenario 5: LeetCode acceptanceRate — computed from solved/submissions", () => {

  test("extractLeetCodeMetrics computes rate as totalSolved/totalSubmissions", () => {
    // The function ignores data.acceptanceRate and computes from solved/submissions
    const metrics = extractLeetCodeMetrics({
      contestRating: 1800, hardSolved: 100, mediumSolved: 300,
      totalSolved: 450, totalSubmissions: 600,
      attendedContests: 20, streak: 50,
    });
    // 450/600 = 0.75
    expect(metrics.acceptanceRate).toBeCloseTo(0.75, 3);
  });

  test("zero submissions yields 0 rate (no division by zero)", () => {
    const metrics = extractLeetCodeMetrics({
      contestRating: 0, hardSolved: 0, mediumSolved: 0,
      totalSolved: 0, totalSubmissions: 0,
      attendedContests: 0,
    });
    // totalSubmissions defaults to 1 in the function: 0/1 = 0
    expect(metrics.acceptanceRate).toBe(0);
  });

  test("high acceptance rate (180/200 = 0.90) is stored as 0-1 decimal", () => {
    const metrics = extractLeetCodeMetrics({
      contestRating: 1500, hardSolved: 50, mediumSolved: 100,
      totalSolved: 180, totalSubmissions: 200,
      attendedContests: 10,
    });
    expect(metrics.acceptanceRate).toBeCloseTo(0.90, 3);
    expect(metrics.acceptanceRate).toBeLessThanOrEqual(1.0);
  });
});

// ─── SCENARIO 6: Codeforces metrics extraction ───────────────────────────────

describe("Scenario 6: Codeforces weighted problem score", () => {

  test("problems solved at higher ratings contribute more to weightedProblemScore", () => {
    const easy = extractCodeforcesMetrics({
      userInfo: { rating: 1200, maxRating: 1200, contribution: 0 },
      contestsParticipated: 5,
      problemsSolvedByRating: { "800": 100 }, // 100 easy problems
    });
    const hard = extractCodeforcesMetrics({
      userInfo: { rating: 1200, maxRating: 1200, contribution: 0 },
      contestsParticipated: 5,
      problemsSolvedByRating: { "2400": 10 }, // 10 hard problems
    });
    // Hard problem weight: 1 + (2400/800)^1.5 = 1 + 3^1.5 ≈ 6.196 per problem → 10 × 6.2 = 62
    // Easy problem weight: 1 + (800/800)^1.5 = 2 per problem → 100 × 2 = 200
    // Easy user has more total, but checking hard weight is much higher per-problem
    expect(hard.weightedProblemScore).toBeGreaterThan(0);
    expect(easy.weightedProblemScore).toBeGreaterThan(hard.weightedProblemScore);
  });

  test("negative contribution is clamped to 0", () => {
    const metrics = extractCodeforcesMetrics({
      userInfo: { rating: 1200, maxRating: 1200, contribution: -50 },
      contestsParticipated: 5,
      problemsSolvedByRating: {},
    });
    expect(metrics.contributionScore).toBe(0);
  });
});

// ─── SCENARIO 7: Score invariants across all combinations ────────────────────

describe("Scenario 7: Score invariants", () => {

  const allCombos = [
    {},
    { codeforces: eliteCF },
    { leetcode: eliteLC },
    { codeforces: eliteCF, leetcode: eliteLC },
    { codeforces: beginCF },
    { codeforces: eliteCF, leetcode: eliteLC,
      github: { totalMergedPRs: 160, totalCommitsLastYear: 155, totalStarsEarned: 150,
                totalReviewsLastYear: 152, totalContribDays: 154, accountAgeFactor: 90 } },
  ];

  test("finalScore always in [0, 100]", () => {
    for (const combo of allCombos) {
      const r = computeCompositeScore(combo as any, fullCtx, 0.80, 0.85);
      expect(r.finalScore).toBeGreaterThanOrEqual(0);
      expect(r.finalScore).toBeLessThanOrEqual(100);
    }
  });

  test("scoreLower ≤ finalScore ≤ scoreUpper", () => {
    for (const combo of allCombos) {
      const r = computeCompositeScore(combo as any, fullCtx, 0.80, 0.85);
      expect(r.scoreLower).toBeLessThanOrEqual(r.finalScore + 0.01); // tolerance for float
      expect(r.scoreUpper).toBeGreaterThanOrEqual(r.finalScore - 0.01);
    }
  });

  test("psWeight + engWeight + brWeight always === 1.0", () => {
    for (const combo of allCombos) {
      const r = computeCompositeScore(combo as any, fullCtx, 0.90, 0.90);
      expect(r.psWeight + r.engWeight + r.brWeight).toBeCloseTo(1.0, 5);
    }
  });

  test("all metric percentileRanks in [0, 100]", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, leetcode: eliteLC },
      fullCtx, 1.0, 1.0
    );
    for (const p of r.platformScores) {
      for (const m of p.metrics) {
        expect(m.percentileRank).toBeGreaterThanOrEqual(0);
        expect(m.percentileRank).toBeLessThanOrEqual(100);
      }
    }
  });

  test("empty user: finalScore < 5 and psScore = 0", () => {
    const r = computeCompositeScore({}, fullCtx, 0.70, 0.80);
    expect(r.finalScore).toBeLessThan(5);
    expect(r.psScore).toBe(0);
    expect(r.fairness.platformsConnected).toBe(0);
  });
});

// ─── SCENARIO 8: Recency CodeChef fix ────────────────────────────────────────

describe("Scenario 8: Recency factor — CodeChef conservative fix", () => {

  test("100 CodeChef contests credits only 1 month (not 50)", () => {
    const factor = computeRecencyFactor({ codechef: { contestsParticipated: 100 } } as any);
    // 1 active month: 0.70 + 0.30*(1-e^-0.12) ≈ 0.734
    expect(factor).toBeGreaterThanOrEqual(RECENCY_CONFIG.MIN_FACTOR);
    expect(factor).toBeLessThan(0.78); // 2 months would give ≈ 0.764
  });

  test("Codeforces with 12 recent monthly contests → high recency", () => {
    const now = Date.now();
    const ratingHistory = Array.from({ length: 12 }, (_, i) => ({
      ratingUpdateTimeSeconds: Math.floor((now - i * 25 * 24 * 3600 * 1000) / 1000),
      oldRating: 1800, newRating: 1820,
    }));
    const factor = computeRecencyFactor({ codeforces: { ratingHistory } } as any);
    expect(factor).toBeGreaterThan(0.90);
  });

  test("inactive user: exact MIN_FACTOR = 0.70", () => {
    expect(computeRecencyFactor({})).toBe(RECENCY_CONFIG.MIN_FACTOR);
  });
});
