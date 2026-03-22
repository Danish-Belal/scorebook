/**
 * tests/unit/sparse_platform.test.ts
 *
 * Tests for the PS / ENG / BR component weight model and sparse-platform behaviour.
 *
 * KEY ENGINE FACT (read this before touching the tests):
 * The engine does NOT do "dump missing component weight into PS".
 * It does proportional renormalisation:
 *   presentWeight = COMP_PS + (eng present ? 0.25 : 0) + (br present ? 0.10 : 0)
 *   scale = 1 / presentWeight
 *   psWeight = 0.65 * scale, engWeight = 0.25 * scale, brWeight = 0.10 * scale
 *
 * Therefore:
 *   PS only (no Eng, no BR):  presentWeight=0.65  → psWeight=1.000
 *   PS + Eng (no BR):         presentWeight=0.90  → psWeight≈0.722, engWeight≈0.278
 *   PS + BR (no Eng):         presentWeight=0.75  → psWeight≈0.867, brWeight≈0.133
 *   PS + Eng + BR:            presentWeight=1.00  → psWeight=0.65, engWeight=0.25, brWeight=0.10
 */

import {
  computeCompositeScore,
  PS_PLATFORMS,
  AllPercentileContexts,
} from "../../src/services/scoring/composite";
import { PercentileContext } from "../../src/services/scoring/percentile";

// ─── Test fixture helpers ─────────────────────────────────────────────────────

/**
 * Uniform context: N values spread 0..N-1.
 * A raw metric value of X (0-based index) lands at percentile (X+0.5)/N * 100.
 * With N=200: raw=90 → PR = (90+0.5)/200*100 = 45.25
 * With N=200: raw=190 → PR = (190+0.5)/200*100 = 95.25
 */
function makeUniformCtx(N = 200): PercentileContext {
  const allValues    = Array.from({ length: N }, (_, i) => i);
  const sortedValues = [...allValues];
  return { allValues, sortedValues };
}

function buildFullCtx(N = 200): AllPercentileContexts {
  const ctx = makeUniformCtx(N);
  const map = new Map<string, PercentileContext>();

  const platformMetrics: Record<string, string[]> = {
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

  for (const [platform, metrics] of Object.entries(platformMetrics)) {
    for (const metric of metrics) {
      map.set(`${platform}:${metric}`, ctx);
    }
  }
  return map;
}

const ctx = buildFullCtx(200);

// Metrics that sit at ~90th percentile in the uniform 0-199 context
// raw=180 → PR = (180+0.5)/200*100 = 90.25
const eliteCF = {
  currentRating: 180, maxRating: 182, weightedProblemScore: 178,
  contestsParticipated: 180, contributionScore: 160,
};
const eliteLC = {
  contestRating: 180, hardSolved: 178, mediumSolved: 175,
  attendedContests: 178, acceptanceRate: 0.85,
};
const eliteGH = {
  totalMergedPRs: 178, totalCommitsLastYear: 175, totalStarsEarned: 170,
  totalReviewsLastYear: 172, totalContribDays: 174, accountAgeFactor: 90,
};
const eliteGFG = {
  practiceScore: 175, problemsSolved: 172, codingStreak: 168,
};

// Metrics at ~30th percentile: raw=60 → PR ≈ (60+0.5)/200*100 = 30.25
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
const avgGFG = {
  practiceScore: 58, problemsSolved: 60, codingStreak: 55,
};

// ─── Component weight model ───────────────────────────────────────────────────

describe("Component weight model — proportional renormalisation", () => {

  test("PS only: psWeight = 1.0 (not 0.65, not 0.90)", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, ctx, 1.0, 1.0);
    expect(r.psWeight).toBeCloseTo(1.0, 2);
    expect(r.engWeight).toBe(0);
    expect(r.brWeight).toBe(0);
  });

  test("PS + Eng: psWeight ≈ 0.722, engWeight ≈ 0.278", () => {
    // presentWeight = 0.65 + 0.25 = 0.90 → scale = 1/0.90
    const r = computeCompositeScore(
      { codeforces: eliteCF, github: eliteGH },
      ctx, 1.0, 1.0
    );
    expect(r.psWeight).toBeCloseTo(0.65 / 0.90, 2);
    expect(r.engWeight).toBeCloseTo(0.25 / 0.90, 2);
    expect(r.brWeight).toBe(0);
  });

  test("PS + BR: psWeight ≈ 0.867, brWeight ≈ 0.133", () => {
    // presentWeight = 0.65 + 0.10 = 0.75 → scale = 1/0.75
    const r = computeCompositeScore(
      { codeforces: eliteCF, gfg: eliteGFG },
      ctx, 1.0, 1.0
    );
    expect(r.psWeight).toBeCloseTo(0.65 / 0.75, 2);
    expect(r.brWeight).toBeCloseTo(0.10 / 0.75, 2);
    expect(r.engWeight).toBe(0);
  });

  test("PS + Eng + BR: original weights exactly (0.65 / 0.25 / 0.10)", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, github: eliteGH, gfg: eliteGFG },
      ctx, 1.0, 1.0
    );
    expect(r.psWeight).toBeCloseTo(0.65, 2);
    expect(r.engWeight).toBeCloseTo(0.25, 2);
    expect(r.brWeight).toBeCloseTo(0.10, 2);
  });

  test("weights always sum to exactly 1.0 for any platform combination", () => {
    const combos = [
      {},
      { codeforces: eliteCF },
      { codeforces: eliteCF, github: eliteGH },
      { codeforces: eliteCF, gfg: eliteGFG },
      { codeforces: eliteCF, github: eliteGH, gfg: eliteGFG },
      { codeforces: eliteCF, leetcode: eliteLC },
      { codeforces: eliteCF, leetcode: eliteLC, github: eliteGH, gfg: eliteGFG },
    ];
    for (const combo of combos) {
      const r = computeCompositeScore(combo as any, ctx, 0.9, 0.9);
      expect(r.psWeight + r.engWeight + r.brWeight).toBeCloseTo(1.0, 5);
    }
  });

  test("fairness note says 'redistributed proportionally' when GitHub not connected", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, ctx, 1.0, 1.0);
    expect(r.fairness.engineeringIncluded).toBe(false);
    expect(r.fairness.note).toContain("redistributed proportionally");
  });

  test("fairness.engineeringIncluded is true when GitHub is connected", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, github: eliteGH },
      ctx, 1.0, 1.0
    );
    expect(r.fairness.engineeringIncluded).toBe(true);
  });
});

// ─── Single-platform dominance mode ──────────────────────────────────────────

describe("Single PS platform — dominance mode", () => {

  test("CF only with enough activity: dominantPlatform = 'codeforces'", () => {
    // eliteCF has contestsParticipated=180 ≥ MIN_CONTESTS(5) → dominant mode
    const r = computeCompositeScore({ codeforces: eliteCF }, ctx, 1.0, 1.0);
    expect(r.fairness.dominantPlatform).toBe("codeforces");
  });

  test("LC only with enough activity: dominantPlatform = 'leetcode'", () => {
    // eliteLC has attendedContests=178 ≥ 5 → dominant mode
    const r = computeCompositeScore({ leetcode: eliteLC }, ctx, 1.0, 1.0);
    expect(r.fairness.dominantPlatform).toBe("leetcode");
  });

  test("In dominant mode, psScore equals the single platform's score", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, ctx, 1.0, 1.0);
    const cfScore = r.platformScores.find(p => p.platform === "codeforces" && p.connected)!.platformScore;
    expect(r.psScore).toBeCloseTo(cfScore, 1);
  });

  test("In dominant mode, missing PS platforms use estimationMethod 'single_dominant'", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, ctx, 1.0, 1.0);
    const estimated = r.platformScores.filter(p => p.estimated);
    expect(estimated.length).toBe(PS_PLATFORMS.length - 1); // 4 missing
    for (const p of estimated) {
      expect(p.estimationMethod).toBe("single_dominant");
    }
  });

  test("CF with 3 contests (below threshold): dominantPlatform is null", () => {
    // contestsParticipated=3 < MIN_CONTESTS(5) and no problems → not dominant
    const lowActivity = {
      currentRating: 180, maxRating: 182, weightedProblemScore: 0,
      contestsParticipated: 3, contributionScore: 10,
    };
    const r = computeCompositeScore({ codeforces: lowActivity }, ctx, 1.0, 1.0);
    expect(r.fairness.dominantPlatform).toBeNull();
  });

  test("Low-activity single platform: missing PS platforms use 'pool_median'", () => {
    const lowActivity = {
      currentRating: 40, maxRating: 42, weightedProblemScore: 0,
      contestsParticipated: 3, contributionScore: 5,
    };
    const r = computeCompositeScore({ codeforces: lowActivity }, ctx, 1.0, 1.0);
    const estimated = r.platformScores.filter(p => p.estimated);
    for (const p of estimated) {
      expect(p.estimationMethod).toBe("pool_median");
      expect(p.platformScore).toBe(50);
    }
  });
});

// ─── Multi-platform estimation ────────────────────────────────────────────────

describe("Multi-platform PS estimation (≥2 connected)", () => {

  test("Missing PS platforms use 'own_average' method", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, leetcode: eliteLC },
      ctx, 1.0, 1.0
    );
    const estimated = r.platformScores.filter(p => p.estimated && p.component === "ps");
    expect(estimated.length).toBe(3); // codechef, atcoder, topcoder
    for (const p of estimated) {
      expect(p.estimationMethod).toBe("own_average");
    }
  });

  test("Elite CF+LC: estimated platforms score above 50 (higher than pool median)", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, leetcode: eliteLC },
      ctx, 1.0, 1.0
    );
    const estimated = r.platformScores.filter(p => p.estimated && p.component === "ps");
    for (const p of estimated) {
      expect(p.platformScore).toBeGreaterThan(50);
    }
  });

  test("Below-average CF+LC: estimated platforms score below 50", () => {
    const r = computeCompositeScore(
      { codeforces: avgCF, leetcode: avgLC },
      ctx, 1.0, 1.0
    );
    const estimated = r.platformScores.filter(p => p.estimated && p.component === "ps");
    for (const p of estimated) {
      expect(p.platformScore).toBeLessThan(50);
    }
  });

  test("estimatedPlatforms array contains exactly the missing PS platforms", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, leetcode: eliteLC },
      ctx, 1.0, 1.0
    );
    expect(r.fairness.estimatedPlatforms).toContain("codechef");
    expect(r.fairness.estimatedPlatforms).toContain("atcoder");
    expect(r.fairness.estimatedPlatforms).toContain("topcoder");
    expect(r.fairness.estimatedPlatforms).not.toContain("codeforces");
    expect(r.fairness.estimatedPlatforms).not.toContain("leetcode");
  });

  test("Elite 2-platform user outscores average-across-all user", () => {
    const elite = computeCompositeScore(
      { codeforces: eliteCF, leetcode: eliteLC },
      ctx, 1.0, 1.0
    );
    const average = computeCompositeScore(
      { codeforces: avgCF, leetcode: avgLC, github: avgGH, gfg: avgGFG },
      ctx, 1.0, 1.0
    );
    expect(elite.finalScore).toBeGreaterThan(average.finalScore);
  });
});

// ─── Score bounds and invariants ──────────────────────────────────────────────

describe("Score bounds — always valid", () => {

  const allCombos = [
    {},
    { codeforces: eliteCF },
    { leetcode: eliteLC },
    { codeforces: eliteCF, leetcode: eliteLC },
    { codeforces: eliteCF, github: eliteGH },
    { codeforces: avgCF, leetcode: avgLC },
    { codeforces: eliteCF, leetcode: eliteLC, github: eliteGH, gfg: eliteGFG },
  ];

  test("finalScore always in [0, 100]", () => {
    for (const combo of allCombos) {
      const r = computeCompositeScore(combo as any, ctx, 0.80, 0.85);
      expect(r.finalScore).toBeGreaterThanOrEqual(0);
      expect(r.finalScore).toBeLessThanOrEqual(100);
    }
  });

  test("scoreLower ≤ finalScore ≤ scoreUpper", () => {
    for (const combo of allCombos) {
      const r = computeCompositeScore(combo as any, ctx, 0.80, 0.85);
      expect(r.scoreLower).toBeLessThanOrEqual(r.finalScore);
      expect(r.scoreUpper).toBeGreaterThanOrEqual(r.finalScore);
    }
  });

  test("all metric percentileRanks in [0, 100]", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, leetcode: eliteLC, github: eliteGH },
      ctx, 1.0, 1.0
    );
    for (const p of r.platformScores) {
      for (const m of p.metrics) {
        expect(m.percentileRank).toBeGreaterThanOrEqual(0);
        expect(m.percentileRank).toBeLessThanOrEqual(100);
      }
    }
  });

  test("empty user gets finalScore near 0 (not 50), fairness shows 0 platforms", () => {
    const r = computeCompositeScore({}, ctx, 0.70, 0.80);
    expect(r.finalScore).toBeLessThan(5);
    expect(r.psScore).toBe(0);
    expect(r.fairness.platformsConnected).toBe(0);
  });
});

// ─── Fairness metadata ────────────────────────────────────────────────────────

describe("Fairness metadata accuracy", () => {

  test("psPlatformsConnected matches actual connected PS platforms", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, leetcode: eliteLC },
      ctx, 1.0, 1.0
    );
    expect(r.fairness.psPlatformsConnected).toBe(2);
    expect(r.fairness.psPlatformsTotal).toBe(5);
  });

  test("platformsConnected counts all components (PS + Eng + BR)", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, github: eliteGH, gfg: eliteGFG },
      ctx, 1.0, 1.0
    );
    expect(r.fairness.platformsConnected).toBe(3);
  });

  test("breadthIncluded is false when no BR platforms connected", () => {
    const r = computeCompositeScore({ codeforces: eliteCF }, ctx, 1.0, 1.0);
    expect(r.fairness.breadthIncluded).toBe(false);
  });

  test("breadthIncluded is true when a BR platform is connected", () => {
    const r = computeCompositeScore(
      { codeforces: eliteCF, gfg: eliteGFG },
      ctx, 1.0, 1.0
    );
    expect(r.fairness.breadthIncluded).toBe(true);
  });
});
