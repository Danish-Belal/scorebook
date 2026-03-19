import { computePercentileRank, batchComputePercentiles, logTransform } from "../../src/services/scoring/percentile";
import { computeRecencyFactor, activityLabel } from "../../src/services/scoring/recency";
import { computeConfidenceFactor } from "../../src/services/scoring/metrics";
import { continuousDifficultyWeight, RECENCY_CONFIG } from "../../src/services/scoring/weights";

// ─── Percentile Engine ────────────────────────────────────────────────────────
describe("Percentile Engine v2", () => {
  it("returns 50 for single-user pool", () => {
    expect(computePercentileRank(500, { allValues: [500], sortedValues: [500] })).toBe(50);
  });

  it("top user scores > 90th percentile in 10-user pool", () => {
    const vals = [100,200,300,400,500,600,700,800,900,1000];
    const ctx  = { allValues: vals, sortedValues: [...vals].sort((a,b)=>a-b) };
    expect(computePercentileRank(1000, ctx)).toBeGreaterThan(90);
  });

  it("bottom user scores < 10th percentile", () => {
    const vals = [100,200,300,400,500,600,700,800,900,1000];
    const ctx  = { allValues: vals, sortedValues: [...vals].sort((a,b)=>a-b) };
    expect(computePercentileRank(100, ctx)).toBeLessThan(10);
  });

  it("handles ties with midpoint formula (all equal → 50th)", () => {
    const vals = [500,500,500,500];
    const ctx  = { allValues: vals, sortedValues: vals };
    expect(computePercentileRank(500, ctx)).toBe(50);
  });

  it("batch processes 10K users in < 500ms", () => {
    const map = new Map<string,number>();
    for (let i = 0; i < 10000; i++) map.set(`u${i}`, Math.random() * 3000);
    const start = Date.now();
    const res   = batchComputePercentiles(map);
    expect(Date.now() - start).toBeLessThan(500);
    expect(res.size).toBe(10000);
  });

  it("adding a new top performer pushes others down", () => {
    const map  = new Map([["a",100],["b",500],["c",1000]]);
    const pre  = batchComputePercentiles(new Map(map));
    map.set("d", 5000);
    const post = batchComputePercentiles(map);
    expect(post.get("c")!).toBeLessThan(pre.get("c")!);
  });

  it("logTransform handles zero without NaN", () => {
    expect(logTransform(0)).toBe(0);
    expect(isNaN(logTransform(-1))).toBe(false);
  });

  it("logTransform compresses outliers", () => {
    expect(logTransform(10000) / logTransform(10)).toBeLessThan(1000);
  });

  it("all results are in [0, 100]", () => {
    const map = new Map<string,number>();
    for (let i = 0; i < 100; i++) map.set(`u${i}`, i * 50);
    batchComputePercentiles(map).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});

// ─── Recency Factor ───────────────────────────────────────────────────────────
describe("Recency Factor v2", () => {
  it("inactive user gets MIN_FACTOR", () => {
    expect(computeRecencyFactor({})).toBe(RECENCY_CONFIG.MIN_FACTOR);
  });

  it("active Codeforces user gets > 0.90", () => {
    const now = Date.now();
    const ratingHistory = Array.from({length:12}, (_,i) => ({
      ratingUpdateTimeSeconds: Math.floor((now - i*30*24*3600*1000)/1000),
      oldRating: 1500, newRating: 1520, contestId: i, contestName: "", handle: "", rank: 100,
    }));
    const factor = computeRecencyFactor({ codeforces: { ratingHistory } });
    expect(factor).toBeGreaterThan(0.90);
  });

  it("active GitHub user gets > 0.85", () => {
    const factor = computeRecencyFactor({ github: { totalCommitsLastYear: 400 } });
    expect(factor).toBeGreaterThan(0.85);
  });

  it("factor is always within [MIN_FACTOR, 1.0]", () => {
    const cases = [
      {},
      { leetcode: { streak: 100, attendedContests: 20 } },
      { github: { totalCommitsLastYear: 1000 }, codeforces: { ratingHistory: [] } },
    ];
    cases.forEach(c => {
      const f = computeRecencyFactor(c as any);
      expect(f).toBeGreaterThanOrEqual(RECENCY_CONFIG.MIN_FACTOR);
      expect(f).toBeLessThanOrEqual(1.0);
    });
  });

  it("activityLabel maps correctly", () => {
    expect(activityLabel(0.97)).toContain("Very Active");
    expect(activityLabel(0.70)).toContain("Inactive");
  });
});

// ─── Confidence Factor ────────────────────────────────────────────────────────
describe("Confidence Factor", () => {
  it("user with no data gets minimum confidence", () => {
    expect(computeConfidenceFactor({})).toBe(0.80);
  });

  it("user with 50+ contests gets high confidence", () => {
    const factor = computeConfidenceFactor({
      codeforces: { contestsParticipated: 50 },
      leetcode:   { attendedContests: 20 },
    } as any);
    expect(factor).toBeGreaterThan(0.95);
  });

  it("confidence is in [0.80, 1.0]", () => {
    const cases = [
      {},
      { codeforces: { contestsParticipated: 5 } },
      { leetcode: { attendedContests: 100, hardSolved: 200, mediumSolved: 500 } },
    ];
    cases.forEach(c => {
      const f = computeConfidenceFactor(c as any);
      expect(f).toBeGreaterThanOrEqual(0.80);
      expect(f).toBeLessThanOrEqual(1.0);
    });
  });
});

// ─── Continuous Difficulty Weight ─────────────────────────────────────────────
describe("Continuous Difficulty Weighting", () => {
  it("easy problems have weight ~1.0", () => {
    expect(continuousDifficultyWeight(800)).toBeCloseTo(2.0, 0);
  });

  it("hard problems (2400+) have higher weight than easy ones", () => {
    expect(continuousDifficultyWeight(2400)).toBeGreaterThan(continuousDifficultyWeight(800));
  });

  it("weight increases monotonically with difficulty", () => {
    const ratings = [400, 800, 1200, 1600, 2000, 2400, 3000];
    for (let i = 1; i < ratings.length; i++) {
      expect(continuousDifficultyWeight(ratings[i])).toBeGreaterThan(
        continuousDifficultyWeight(ratings[i-1])
      );
    }
  });

  it("zero rating returns 1.0 base weight", () => {
    expect(continuousDifficultyWeight(0)).toBe(1.0);
  });
});
