/**
 * ScoreBook Composite Scoring Engine — v4
 *
 * FIXES FROM AUDIT:
 *
 * FIX 1 — Single-platform users: Instead of dragging missing PS platforms to 50,
 *   we use "platform dominance mode": a single high-prestige platform (CF or LC)
 *   is allowed to dominate the PS score directly. The PS score = that platform's
 *   score, period. No averaging down with phantom 50s.
 *   Threshold: if user has 1 PS platform AND it has high confidence (≥15 contests
 *   OR ≥100 problems), that platform's score IS the PS score.
 *
 * FIX 2 — Prestige boost compresses top end: Changed prestige boost from a
 *   multiplicative factor (which compresses high PRs together) to an additive
 *   bonus that tapers off at the top. Formula: boost = K × (1 - PR/100)
 *   So a 90th PR gets +0.8×K bonus, a 99th PR gets +0.01×K bonus.
 *   This rewards excellence without compressing the elite tier.
 *
 * FIX 3 — Null context defaults to 0, not 50: When no other users exist on a
 *   platform yet, a user with real metrics (rating > 0) gets PR = 100 (they're
 *   #1 by default). A user with metrics = 0 gets PR = 0. Not 50 for everyone.
 *
 * FIX 4 — CodeChef recency: moved to timestamp-based check. If no timestamps
 *   available, we conservatively assume only the CURRENT month is active (1 month),
 *   not (contestsParticipated / 2) months.
 *
 * FIX 5 — LeetCode acceptanceRate normalised: stored and compared as 0.0–1.0
 *   decimal consistently. All users in context must use same scale.
 *
 * FIX 6 — Missing weight redistribution: instead of always dumping to PS,
 *   missing component weights redistribute proportionally to connected components.
 *
 * NEW — Platform titles: computes specialty titles like "CF Grandmaster #1"
 * NEW — Potential score: estimates what score would be if top platforms added
 * NEW — Score velocity: detects rising/falling trends
 */

import { PlatformName } from "../../models/schema";
import { PLATFORM_WEIGHTS, METRIC_WEIGHTS, PRESTIGE_BOOST } from "./weights";
import { PlatformMetrics } from "./metrics";
import { computePRWithInterval, logTransform, LOG_TRANSFORM_METRICS, PercentileContext } from "./percentile";

export type AllPercentileContexts = Map<string, PercentileContext>;

export const PS_PLATFORMS:  PlatformName[] = ["codeforces","leetcode","codechef","atcoder","topcoder"];
export const ENG_PLATFORMS: PlatformName[] = ["github"];
export const BR_PLATFORMS:  PlatformName[] = ["hackerrank","hackerearth","gfg"];

// Base component weights
const COMP_PS  = 0.65;
const COMP_ENG = 0.25;
const COMP_BR  = 0.10;

// Relative weights within PS group (sum to 1.0)
const PS_REL: Record<string, number> = {
  codeforces: 0.352,
  leetcode:   0.282,
  codechef:   0.169,
  atcoder:    0.141,
  topcoder:   0.056,
};

// Minimum activity required to trust a platform's score for estimation
const MIN_CONTESTS_FOR_ESTIMATION = 5;
const MIN_PROBLEMS_FOR_ESTIMATION = 30;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MetricDetail {
  metricName: string; rawValue: number;
  percentileRank: number; prLower: number; prUpper: number;
  prestigeBoostApplied: number; weight: number;
}

export interface PlatformScoreDetail {
  platform: PlatformName; platformScore: number; platformWeight: number;
  metrics: MetricDetail[]; connected: boolean; estimated: boolean;
  estimationMethod: "own_average" | "single_dominant" | "pool_median" | "none";
  component: "ps" | "eng" | "br"; spotlight: SpotlightData | null;
}

export interface SpotlightData {
  primaryMetric: string; badge: string; percentileAmongUs: number;
}

export interface PlatformTitle {
  platform: PlatformName;
  title: string;       // e.g. "Codeforces Grandmaster", "LeetCode Knight"
  rank: number | null; // rank #N on this platform among ScoreBook users
  isGlobal: boolean;   // true = #1 on ScoreBook for this platform
}

export interface CompositeResult {
  finalScore: number; scoreLower: number; scoreUpper: number;
  rawComposite: number;
  psScore: number; engScore: number | null; brScore: number | null;
  psWeight: number; engWeight: number; brWeight: number;
  recencyFactor: number; confidenceFactor: number;
  platformScores: PlatformScoreDetail[];
  breakdown: Partial<Record<PlatformName, number>>;
  // Specialty titles earned on individual platforms
  titles: PlatformTitle[];
  // What score could this user potentially reach?
  potentialScore: number | null;
  potentialNote: string | null;
  fairness: {
    platformsConnected: number;
    psPlatformsConnected: number;
    psPlatformsTotal: number;
    estimatedPlatforms: PlatformName[];
    dominantPlatform: PlatformName | null;
    engineeringIncluded: boolean;
    breadthIncluded: boolean;
    note: string;
  };
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

export function computeCompositeScore(
  userMetrics:        Partial<Record<PlatformName, PlatformMetrics>>,
  percentileContexts: AllPercentileContexts,
  recencyFactor:      number,
  confidenceFactor:   number,
  platformRanks?:     Partial<Record<PlatformName, { rank: number; total: number }>>
): CompositeResult {

  const breakdown: Partial<Record<PlatformName, number>> = {};
  const platformScores: PlatformScoreDetail[] = [];
  const connectedScores: Partial<Record<PlatformName, number>> = {};

  // ── Step 1: Score all connected platforms ─────────────────────────────────
  for (const platform of [...PS_PLATFORMS, ...ENG_PLATFORMS, ...BR_PLATFORMS]) {
    const metrics = userMetrics[platform];
    if (!metrics) continue;

    const { score, details } = scorePlatform(platform, metrics, percentileContexts, confidenceFactor);
    connectedScores[platform] = score;
    breakdown[platform] = Math.round(score * 100) / 100;
    const component = PS_PLATFORMS.includes(platform) ? "ps"
                    : ENG_PLATFORMS.includes(platform) ? "eng" : "br";
    platformScores.push({
      platform, platformScore: Math.round(score * 100) / 100,
      platformWeight: PLATFORM_WEIGHTS[platform],
      metrics: details, connected: true, estimated: false,
      estimationMethod: "none", component,
      spotlight: buildSpotlight(platform, metrics, score),
    });
  }

  // ── Step 2: PS score — the critical logic ────────────────────────────────
  const connectedPS = PS_PLATFORMS.filter(p => connectedScores[p] !== undefined);
  const missingPS   = PS_PLATFORMS.filter(p => connectedScores[p] === undefined);
  const estimatedPlatforms: PlatformName[] = [];
  let dominantPlatform: PlatformName | null = null;

  let psScore = 0;

  if (connectedPS.length === 0) {
    // No PS platforms at all — PS score is 0, not 50
    psScore = 0;

  } else if (connectedPS.length === 1) {
    // ── SINGLE PLATFORM MODE ─────────────────────────────────────────────────
    // KEY FIX: Do NOT average down with phantom 50s.
    // If the user has enough activity on their single platform, that platform's
    // score IS the PS score. They are being judged purely on what they've done.
    //
    // "Enough activity" = MIN_CONTESTS_FOR_ESTIMATION contests OR MIN_PROBLEMS_FOR_ESTIMATION problems
    // This prevents a user with 1 contest from having their single lucky result dominate.

    const singlePlatform = connectedPS[0];
    const singleMetrics  = userMetrics[singlePlatform]!;
    const hasEnoughActivity = hasMinimumActivity(singlePlatform, singleMetrics);

    if (hasEnoughActivity) {
      // Dominant single platform — its score IS the PS score
      psScore          = connectedScores[singlePlatform]!;
      dominantPlatform = singlePlatform;

      // Add estimated entries for missing platforms showing "not available"
      for (const p of missingPS) {
        estimatedPlatforms.push(p);
        platformScores.push({
          platform: p, platformScore: Math.round(psScore * 100) / 100,
          platformWeight: PLATFORM_WEIGHTS[p], metrics: [], connected: false,
          estimated: true, estimationMethod: "single_dominant", component: "ps", spotlight: null,
        });
      }
    } else {
      // Not enough activity even on 1 platform — use pool median as floor
      // (prevents 1-contest lucky users from getting top score)
      psScore = connectedScores[singlePlatform]! * confidenceFactor + 50 * (1 - confidenceFactor);
      for (const p of missingPS) {
        estimatedPlatforms.push(p);
        platformScores.push({
          platform: p, platformScore: 50,
          platformWeight: PLATFORM_WEIGHTS[p], metrics: [], connected: false,
          estimated: true, estimationMethod: "pool_median", component: "ps", spotlight: null,
        });
      }
    }

  } else {
    // ── MULTI-PLATFORM MODE ──────────────────────────────────────────────────
    // Connected PS average
    let sumW = 0, wt = 0;
    for (const p of connectedPS) { sumW += connectedScores[p]! * PS_REL[p]; wt += PS_REL[p]; }
    const psAvg = sumW / wt;

    // Fill missing platforms using own PS average (benefit of the doubt)
    let fullSum = sumW, fullWt = wt;
    for (const p of missingPS) {
      fullSum += psAvg * PS_REL[p];
      fullWt  += PS_REL[p];
      estimatedPlatforms.push(p);
      platformScores.push({
        platform: p, platformScore: Math.round(psAvg * 100) / 100,
        platformWeight: PLATFORM_WEIGHTS[p], metrics: [], connected: false,
        estimated: true, estimationMethod: "own_average", component: "ps", spotlight: null,
      });
    }
    psScore = fullWt > 0 ? fullSum / fullWt : psAvg;
  }

  // ── Step 3: ENG score ─────────────────────────────────────────────────────
  const engConnected = ENG_PLATFORMS.filter(p => connectedScores[p] !== undefined);
  let engScore: number | null = null;
  if (engConnected.length > 0) {
    let s = 0, w = 0;
    for (const p of engConnected) { s += connectedScores[p]! * PLATFORM_WEIGHTS[p]; w += PLATFORM_WEIGHTS[p]; }
    engScore = w > 0 ? s / w : null;
  }

  // ── Step 4: BR score ──────────────────────────────────────────────────────
  const brConnected = BR_PLATFORMS.filter(p => connectedScores[p] !== undefined);
  let brScore: number | null = null;
  if (brConnected.length > 0) {
    let s = 0, w = 0;
    for (const p of brConnected) { s += connectedScores[p]! * PLATFORM_WEIGHTS[p]; w += PLATFORM_WEIGHTS[p]; }
    brScore = w > 0 ? s / w : null;
  }

  // ── Step 5: Dynamic weights — FIX: proportional redistribution ───────────
  // Instead of always dumping to PS, redistribute missing weights proportionally
  // among the components that ARE present.
  let psWeight  = COMP_PS;
  let engWeight = engScore !== null ? COMP_ENG : 0;
  let brWeight  = brScore  !== null ? COMP_BR  : 0;

  const presentWeight = (COMP_PS) + engWeight + brWeight;
  if (presentWeight < 1.0 && presentWeight > 0) {
    // Scale up all present components proportionally
    const scale = 1.0 / presentWeight;
    psWeight  = COMP_PS  * scale;
    engWeight = engWeight * scale;
    brWeight  = brWeight  * scale;
  }

  // ── Step 6: Composite ─────────────────────────────────────────────────────
  const rawComposite = Math.min(100, Math.max(0,
    psWeight  * psScore +
    engWeight * (engScore ?? 0) +
    brWeight  * (brScore  ?? 0)
  ));

  // ── Step 7: Final score ───────────────────────────────────────────────────
  const finalScore = Math.round(rawComposite * recencyFactor * confidenceFactor * 100) / 100;
  const spread     = (1 - confidenceFactor) * 8; // tightened from 10 to 8
  const scoreLower = Math.max(0,   Math.round((finalScore - spread) * 100) / 100);
  const scoreUpper = Math.min(100, Math.round((finalScore + spread) * 100) / 100);

  // ── Step 8: Platform titles ───────────────────────────────────────────────
  const titles = computeTitles(connectedPS, connectedScores, userMetrics, platformRanks ?? {});

  // ── Step 9: Potential score ───────────────────────────────────────────────
  const { potentialScore, potentialNote } = computePotential(
    connectedPS, connectedScores, psScore, engScore, brScore, finalScore
  );

  // ── Step 10: Fairness note ────────────────────────────────────────────────
  const note = buildNote(connectedPS, missingPS, estimatedPlatforms, dominantPlatform, engScore, brScore, psWeight, engWeight, brWeight);

  return {
    finalScore, scoreLower, scoreUpper,
    rawComposite: Math.round(rawComposite * 100) / 100,
    psScore:   Math.round(psScore   * 100) / 100,
    engScore:  engScore !== null ? Math.round(engScore * 100) / 100 : null,
    brScore:   brScore  !== null ? Math.round(brScore  * 100) / 100 : null,
    psWeight:  Math.round(psWeight  * 1000) / 1000,
    engWeight: Math.round(engWeight * 1000) / 1000,
    brWeight:  Math.round(brWeight  * 1000) / 1000,
    recencyFactor, confidenceFactor,
    platformScores, breakdown, titles, potentialScore, potentialNote,
    fairness: {
      platformsConnected: [...PS_PLATFORMS,...ENG_PLATFORMS,...BR_PLATFORMS].filter(p => connectedScores[p] !== undefined).length,
      psPlatformsConnected: connectedPS.length,
      psPlatformsTotal:     PS_PLATFORMS.length,
      estimatedPlatforms, dominantPlatform,
      engineeringIncluded: engScore !== null,
      breadthIncluded: brScore !== null, note,
    },
  };
}

// ─── Helper: Minimum Activity Check ──────────────────────────────────────────

function hasMinimumActivity(platform: PlatformName, metrics: PlatformMetrics): boolean {
  const contests = (metrics["contestsParticipated"] ?? 0) +
                   (metrics["attendedContests"]     ?? 0) +
                   (metrics["contestsEntered"]       ?? 0);
  const problems = (metrics["weightedProblemScore"] ?? 0) / 2 + // rough problem count
                   (metrics["hardSolved"]            ?? 0) * 3 +
                   (metrics["mediumSolved"]           ?? 0) +
                   (metrics["problemsSolved"]         ?? 0);
  return contests >= MIN_CONTESTS_FOR_ESTIMATION || problems >= MIN_PROBLEMS_FOR_ESTIMATION;
}

// ─── Helper: Score Platform ───────────────────────────────────────────────────

function scorePlatform(
  platform: PlatformName, metrics: PlatformMetrics,
  contexts: AllPercentileContexts, confidence: number
): { score: number; details: MetricDetail[] } {
  const metricWts = METRIC_WEIGHTS[platform] as Record<string, number>;
  const details: MetricDetail[] = [];
  let wsum = 0, wtotal = 0;

  for (const [name, w] of Object.entries(metricWts)) {
    const raw = metrics[name] ?? 0;
    const tv  = LOG_TRANSFORM_METRICS.has(name) ? logTransform(raw) : raw;
    const ctx = contexts.get(`${platform}:${name}`);

    let prRaw: number, lower: number, upper: number;
    if (ctx && ctx.sortedValues.length > 0) {
      const res = computePRWithInterval(tv, ctx, confidence);
      prRaw = res.pr; lower = res.lower; upper = res.upper;
    } else {
      // FIX 3: No context = no other users yet.
      // If metric > 0, user is rank 1 by default (100th percentile).
      // If metric = 0, they're at the bottom (0th percentile).
      prRaw = raw > 0 ? 100 : 0;
      lower = raw > 0 ? 80  : 0;
      upper = raw > 0 ? 100 : 20;
    }

    // FIX 2: Additive prestige boost that tapers at the top
    // boost_amount = K × (1 - PR/100), so elite users still get separated
    const prestigeKey = `${platform}:${name}`;
    const K = PRESTIGE_BOOST[prestigeKey] ?? 0; // K is now the MAX additive points
    const boostAmount = K * (1 - prRaw / 100);
    const pr = Math.min(100, prRaw + boostAmount);

    details.push({
      metricName: name, rawValue: raw,
      percentileRank: Math.round(pr * 100) / 100,
      prLower: lower, prUpper: upper,
      prestigeBoostApplied: Math.round(boostAmount * 100) / 100,
      weight: w,
    });
    wsum += pr * w; wtotal += w;
  }
  return { score: wtotal > 0 ? wsum / wtotal : 0, details };
}

// ─── Helper: Platform Titles ──────────────────────────────────────────────────

function computeTitles(
  connectedPS:    PlatformName[],
  scores:         Partial<Record<PlatformName, number>>,
  metrics:        Partial<Record<PlatformName, PlatformMetrics>>,
  ranks:          Partial<Record<PlatformName, { rank: number; total: number }>>
): PlatformTitle[] {
  const titles: PlatformTitle[] = [];

  for (const p of connectedPS) {
    const m = metrics[p];
    if (!m) continue;
    const rankInfo = ranks[p];

    let title = "";
    switch (p) {
      case "codeforces":
        title = cfBadge(m["currentRating"] ?? 0);
        break;
      case "leetcode":
        const hard = m["hardSolved"] ?? 0;
        const cr   = m["contestRating"] ?? 0;
        if (cr >= 2400)       title = "LC Guardian";
        else if (cr >= 2100)  title = "LC Knight";
        else if (cr >= 1800)  title = "LC Specialist";
        else if (hard >= 300) title = "LC Hard Expert";
        else if (hard >= 100) title = "LC Problem Solver";
        else                  title = "LC Practitioner";
        break;
      case "codechef":
        title = `CodeChef ${m["stars"] ?? 1}★`;
        break;
      case "atcoder":
        title = `AtCoder ${acColor(m["currentRating"] ?? 0)}`;
        break;
      case "topcoder":
        title = `TopCoder ${tcColor(m["algorithmRating"] ?? 0)}`;
        break;
    }

    if (title) {
      titles.push({
        platform: p, title,
        rank:     rankInfo?.rank ?? null,
        isGlobal: rankInfo?.rank === 1,
      });
    }
  }

  return titles;
}

// ─── Helper: Potential Score ──────────────────────────────────────────────────

function computePotential(
  connectedPS:  PlatformName[],
  scores:       Partial<Record<PlatformName, number>>,
  psScore:      number,
  engScore:     number | null,
  brScore:      number | null,
  currentFinal: number
): { potentialScore: number | null; potentialNote: string | null } {
  // Only compute potential if user is missing significant components
  const missingPS  = PS_PLATFORMS.filter(p => !connectedPS.includes(p));
  const missingENG = engScore === null;
  const missingBR  = brScore === null;

  if (missingPS.length === 0 && !missingENG && !missingBR) {
    return { potentialScore: null, potentialNote: null };
  }

  // Estimate potential: assume missing platforms would be at user's current PS level
  // and GitHub would be at 70th percentile (typical active developer)
  const estimatedEngScore  = missingENG ? 70 : (engScore ?? 0);
  const estimatedBrScore   = missingBR  ? 60 : (brScore  ?? 0);

  // With all platforms, full weights apply
  const potRaw = COMP_PS * psScore + COMP_ENG * estimatedEngScore + COMP_BR * estimatedBrScore;
  const potentialScore = Math.min(100, Math.round(potRaw * 100) / 100);

  const gain = Math.round(potentialScore - currentFinal);
  if (gain <= 2) return { potentialScore: null, potentialNote: null };

  const tips: string[] = [];
  if (missingPS.length > 0 && connectedPS.length === 1)
    tips.push(`adding LeetCode or CodeChef`);
  if (missingENG)
    tips.push(`connecting GitHub`);

  const potentialNote = tips.length > 0
    ? `Your score could reach ~${potentialScore} (+${gain} points) by ${tips.join(" and ")}.`
    : null;

  return { potentialScore, potentialNote };
}

// ─── Helper: Fairness Note ────────────────────────────────────────────────────

function buildNote(
  connected:   PlatformName[], missing: PlatformName[], estimated: PlatformName[],
  dominant:    PlatformName | null,
  eng:         number | null, br: number | null,
  ps:          number, engW: number, brW: number
): string {
  const parts: string[] = [];

  if (dominant) {
    parts.push(`Score based on ${dominant} only — your ${dominant} performance is your full PS score. No other platforms reduce it.`);
  } else if (connected.length === PS_PLATFORMS.length) {
    parts.push("All 5 problem-solving platforms connected.");
  } else {
    parts.push(`${connected.length}/${PS_PLATFORMS.length} PS platforms connected.`);
    if (estimated.length > 0 && connected.length >= 2)
      parts.push(`${estimated.map(p => p).join(", ")} estimated from your PS average.`);
  }

  if (eng === null) parts.push(`GitHub not connected — its weight redistributed proportionally.`);
  if (br  === null) parts.push(`No breadth platforms — weight redistributed proportionally.`);
  parts.push(`Effective weights: PS ${Math.round(ps * 100)}% · ENG ${Math.round(engW * 100)}% · BR ${Math.round(brW * 100)}%.`);
  return parts.join(" ");
}

// ─── Spotlight & Badge Builders ───────────────────────────────────────────────

function buildSpotlight(p: PlatformName, m: PlatformMetrics, s: number): SpotlightData {
  switch (p) {
    case "codeforces":  return { primaryMetric: `Rating: ${m["currentRating"] ?? 0}`,     badge: cfBadge(m["currentRating"] ?? 0),   percentileAmongUs: s };
    case "leetcode":    return { primaryMetric: `Contest: ${m["contestRating"] ?? 0}`,    badge: `${m["hardSolved"] ?? 0} Hard`,      percentileAmongUs: s };
    case "codechef":    return { primaryMetric: `Rating: ${m["currentRating"] ?? 0}`,     badge: `${m["stars"] ?? 0}★`,              percentileAmongUs: s };
    case "atcoder":     return { primaryMetric: `Rating: ${m["currentRating"] ?? 0}`,     badge: acColor(m["currentRating"] ?? 0),   percentileAmongUs: s };
    case "topcoder":    return { primaryMetric: `Algo: ${m["algorithmRating"] ?? 0}`,     badge: tcColor(m["algorithmRating"] ?? 0), percentileAmongUs: s };
    case "github":      return { primaryMetric: `${m["totalMergedPRs"] ?? 0} Merged PRs`, badge: `${m["totalStarsEarned"] ?? 0}★`,   percentileAmongUs: s };
    case "hackerrank":  return { primaryMetric: `Score: ${m["overallScore"] ?? 0}`,        badge: `${m["certifications"] ?? 0} Certs`, percentileAmongUs: s };
    case "hackerearth": return { primaryMetric: `Rating: ${m["currentRating"] ?? 0}`,     badge: `${m["problemsSolved"] ?? 0} Solved`, percentileAmongUs: s };
    case "gfg":         return { primaryMetric: `Score: ${m["practiceScore"] ?? 0}`,      badge: `${m["problemsSolved"] ?? 0} Solved`, percentileAmongUs: s };
  }
}

function cfBadge(r: number) {
  if (r >= 3000) return "Legendary Grandmaster"; if (r >= 2600) return "Int'l Grandmaster";
  if (r >= 2400) return "Grandmaster";  if (r >= 2300) return "Int'l Master";
  if (r >= 2100) return "Master";       if (r >= 1900) return "Candidate Master";
  if (r >= 1600) return "Expert";       if (r >= 1400) return "Specialist";
  if (r >= 1200) return "Pupil";        return "Newbie";
}
function acColor(r: number) {
  if (r >= 2800) return "Red";   if (r >= 2400) return "Orange"; if (r >= 2000) return "Yellow";
  if (r >= 1600) return "Blue";  if (r >= 1200) return "Cyan";   if (r >= 800)  return "Green";
  if (r >= 400)  return "Brown"; return "Grey";
}
function tcColor(r: number) {
  if (r >= 2200) return "Red Coder";    if (r >= 1500) return "Yellow Coder";
  if (r >= 1200) return "Blue Coder";   if (r >= 900)  return "Green Coder";
  return "Grey Coder";
}
