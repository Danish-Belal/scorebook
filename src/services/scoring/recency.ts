import { PlatformName } from "../../models/schema";
import { RECENCY_CONFIG } from "./weights";

/**
 * Recency Factor v2
 *
 * Collects active months across ALL platforms, deduplicates,
 * then applies the decay formula:
 *   factor = MIN + (1 - MIN) * (1 - e^(-DECAY * active_months))
 *
 * Each platform contributes its own activity signals:
 * - Codeforces: contest timestamps
 * - LeetCode: streak days, contests attended
 * - CodeChef: contest participations
 * - GitHub: commits per month (estimated from yearly total)
 * - Others: rating/participation data as proxy
 */
export function computeRecencyFactor(platformData: Partial<Record<PlatformName, any>>): number {
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const activeMonths    = new Set<string>();

  for (const [platform, raw] of Object.entries(platformData)) {
    if (!raw) continue;
    const months = extractActiveMonths(platform as PlatformName, raw, twelveMonthsAgo);
    months.forEach(m => activeMonths.add(m));
  }

  const n = activeMonths.size;
  const { MIN_FACTOR, DECAY_RATE } = RECENCY_CONFIG;
  const factor = MIN_FACTOR + (1 - MIN_FACTOR) * (1 - Math.exp(-DECAY_RATE * n));
  return Math.round(Math.min(1.0, factor) * 1000) / 1000;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function extractActiveMonths(
  platform: PlatformName,
  raw: any,
  since: Date
): string[] {
  const months: string[] = [];
  const now = new Date();

  switch (platform) {
    case "codeforces":
      for (const c of raw.ratingHistory ?? []) {
        const d = new Date((c.ratingUpdateTimeSeconds ?? 0) * 1000);
        if (d >= since) months.push(monthKey(d));
      }
      break;

    case "leetcode":
      // LeetCode streak as proxy — assume streak days are recent
      if ((raw.streak ?? 0) > 0) {
        const recentMonths = Math.min(12, Math.ceil(raw.streak / 25));
        for (let i = 0; i < recentMonths; i++) {
          const d = new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000);
          months.push(monthKey(d));
        }
      }
      if ((raw.attendedContests ?? 0) > 0) months.push(monthKey(now));
      break;

    case "codechef":
      // FIX: We don't have per-contest timestamps from CodeChef scraping.
      // Conservatively credit only the current month if they have any contests.
      // Better to undercount than to credit 5-year-old activity as recent.
      // TODO: When CodeChef API adds timestamps, upgrade this to exact months.
      if ((raw.contestsParticipated ?? 0) > 0) {
        months.push(monthKey(now));
      }
      break;

    case "github":
      // Use commits per year to estimate active months (10 commits ≈ 1 active month)
      const ghActiveMonths = Math.min(12, Math.ceil((raw.totalCommitsLastYear ?? 0) / 10));
      for (let i = 0; i < ghActiveMonths; i++) {
        const d = new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000);
        months.push(monthKey(d));
      }
      break;

    case "atcoder":
      if ((raw.contestsParticipated ?? 0) > 0) {
        months.push(monthKey(now)); // Not enough time data from AtCoder scrape
      }
      break;

    default:
      // For hackerrank, hackerearth, topcoder, gfg — use rating/problems as proxy
      const hasActivity = (raw.currentRating ?? 0) > 0 ||
                          (raw.problemsSolved ?? 0) > 0 ||
                          (raw.overallScore ?? 0) > 0;
      if (hasActivity) months.push(monthKey(now));
      break;
  }

  return months;
}

export function activityLabel(factor: number): string {
  if (factor >= 0.96) return "🔥 Very Active";
  if (factor >= 0.88) return "✅ Active";
  if (factor >= 0.80) return "🔵 Moderate";
  if (factor >= 0.74) return "🟡 Low Activity";
  return "⚪ Inactive";
}
