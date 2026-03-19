export const PLATFORMS = {
  codeforces:  { name: "Codeforces",   weight: 25, color: "#1890ff", tier: "S", emoji: "⚡" },
  leetcode:    { name: "LeetCode",     weight: 20, color: "#ffa116", tier: "S", emoji: "🔥" },
  github:      { name: "GitHub",       weight: 20, color: "#24292f", tier: "S", emoji: "🐙" },
  codechef:    { name: "CodeChef",     weight: 12, color: "#7b3f00", tier: "A", emoji: "👨‍🍳" },
  atcoder:     { name: "AtCoder",      weight: 10, color: "#222",    tier: "A", emoji: "🎯" },
  hackerrank:  { name: "HackerRank",   weight:  5, color: "#00ea64", tier: "B", emoji: "🟢" },
  topcoder:    { name: "TopCoder",     weight:  4, color: "#ef3c3c", tier: "B", emoji: "🏆" },
  hackerearth: { name: "HackerEarth", weight:  3, color: "#2c3e88", tier: "C", emoji: "🌍" },
  gfg:         { name: "GeeksForGeeks", weight: 1, color: "#2f8d46", tier: "C", emoji: "🧠" },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

export const PLATFORM_EXAMPLES: Record<PlatformKey, string> = {
  codeforces:  "https://codeforces.com/profile/tourist",
  leetcode:    "https://leetcode.com/u/neal_wu",
  github:      "https://github.com/torvalds",
  atcoder:     "https://atcoder.jp/users/tourist",
  gfg:         "https://www.geeksforgeeks.org/user/yourusername",
  codechef:    "https://www.codechef.com/users/gennady",
  hackerrank:  "https://www.hackerrank.com/yourusername",
  hackerearth: "https://www.hackerearth.com/@yourusername",
  topcoder:    "https://www.topcoder.com/members/yourusername",
};

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatScore(score: number): string {
  return score.toFixed(1);
}

export function getScoreColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-blue-400";
  if (score >= 50) return "text-yellow-400";
  return "text-slate-400";
}

export function getScoreGradient(score: number): string {
  if (score >= 85) return "from-emerald-500 to-teal-400";
  if (score >= 70) return "from-blue-500 to-cyan-400";
  if (score >= 50) return "from-yellow-500 to-orange-400";
  return "from-slate-500 to-slate-400";
}

export function getRankBadge(rank: number): { label: string; color: string } {
  if (rank === 1) return { label: "👑 #1", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" };
  if (rank <= 3)  return { label: `🥇 #${rank}`, color: "text-yellow-300 bg-yellow-300/10 border-yellow-300/30" };
  if (rank <= 10) return { label: `#${rank}`, color: "text-blue-400 bg-blue-400/10 border-blue-400/30" };
  if (rank <= 50) return { label: `#${rank}`, color: "text-purple-400 bg-purple-400/10 border-purple-400/30" };
  return { label: `#${rank}`, color: "text-slate-400 bg-slate-400/10 border-slate-400/30" };
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
