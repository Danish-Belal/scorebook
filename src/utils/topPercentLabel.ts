/**
 * Human-readable standing from zero-based rank index (e.g. Redis ZREVRANK) and set size.
 * Shared by leaderboard rows and score dashboard payload — single source of truth.
 */
export function topPercentLabel(rankIndex0: number, totalUsers: number): string {
  if (totalUsers === 0) return "Top 100%";
  const pct = ((rankIndex0 + 1) / totalUsers) * 100;
  if (pct <= 1) return "Top 1%";
  if (pct <= 5) return "Top 5%";
  if (pct <= 10) return "Top 10%";
  if (pct <= 25) return "Top 25%";
  if (pct <= 50) return "Top 50%";
  return "Top 75%";
}
