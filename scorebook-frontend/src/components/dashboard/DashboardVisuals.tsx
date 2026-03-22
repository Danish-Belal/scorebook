"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { PLATFORMS, PlatformKey, formatScore, getScoreColor } from "@/lib/constants";
import type { ScoreHistory } from "@/lib/api";

// ─── Score Ring ───────────────────────────────────────────────────────────────
export function ScoreRing({
  score,
  lower,
  upper,
}: {
  score: number;
  lower: number | null;
  upper: number | null;
}) {
  const radius = 80;
  const circ = 2 * Math.PI * radius;
  const fill = (score / 100) * circ;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="200" height="200" className="score-ring -rotate-90">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - fill}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b63ed" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-5xl font-black text-white font-mono"
        >
          {formatScore(score)}
        </motion.span>
        {lower && upper && (
          <span className="text-xs text-slate-500 mt-1">
            {lower.toFixed(0)} – {upper.toFixed(0)}
          </span>
        )}
        <span className="text-xs text-slate-400 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white/3 rounded-lg p-2">
      <p className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white font-semibold mt-0.5">{value ?? "–"}</p>
    </div>
  );
}

// ─── Platform Card ────────────────────────────────────────────────────────────
export function PlatformCard({
  platformKey,
  data,
  score,
}: {
  platformKey: string;
  data: any;
  score: number | null;
}) {
  const meta = PLATFORMS[platformKey as PlatformKey];
  if (!meta || !data) return null;

  return (
    <motion.div whileHover={{ y: -2 }} className="glass glass-hover rounded-xl p-5 border border-white/5 cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <h3 className="text-sm font-semibold text-white">{meta.name}</h3>
            {data.badge && <p className="text-xs text-slate-400">{data.badge}</p>}
          </div>
        </div>
        <div className="text-right">
          {score !== null ? (
            <>
              <p className={`text-xl font-black font-mono ${getScoreColor(score)}`}>{formatScore(score)}</p>
              <p className="text-xs text-slate-500">/ 100</p>
            </>
          ) : (
            <span className="text-xs text-slate-500">–</span>
          )}
        </div>
      </div>

      {data.rawData && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {platformKey === "codeforces" && data.rawData.userInfo && (
            <>
              <Stat label="Rating" value={data.rawData.userInfo.rating} />
              <Stat label="Max" value={data.rawData.userInfo.maxRating} />
              <Stat label="Contests" value={data.rawData.contestsParticipated} />
              <Stat label="Solved" value={data.rawData.uniqueProblemsSolved} />
            </>
          )}
          {platformKey === "leetcode" && (
            <>
              <Stat label="Contest" value={data.rawData.contestRating?.toFixed(0)} />
              <Stat label="Hard" value={data.rawData.hardSolved} />
              <Stat label="Medium" value={data.rawData.mediumSolved} />
              <Stat label="Streak" value={`${data.rawData.streak}d`} />
            </>
          )}
          {platformKey === "github" && (
            <>
              <Stat label="PRs" value={data.rawData.totalMergedPRs} />
              <Stat label="Commits" value={data.rawData.totalCommitsLastYear} />
              <Stat label="Stars" value={data.rawData.totalStarsEarned} />
              <Stat label="Days" value={data.rawData.totalContributionDays} />
            </>
          )}
          {platformKey === "codechef" && (
            <>
              <Stat label="Rating" value={data.rawData.currentRating} />
              <Stat label="Stars" value={`${data.rawData.stars}★`} />
            </>
          )}
          {platformKey === "atcoder" && (
            <>
              <Stat label="Rating" value={data.rawData.rating} />
              <Stat label="Color" value={data.rawData.rank} />
            </>
          )}
        </div>
      )}

      {data.rankAmongUs && data.totalOnPlatform && (
        <div className="mt-3 pt-3 border-t border-white/5 text-xs text-slate-500">
          <span className="text-brand-400 font-semibold">#{data.rankAmongUs}</span>
          <span> of {data.totalOnPlatform} on ScoreBook</span>
        </div>
      )}
    </motion.div>
  );
}

// ─── History Chart ────────────────────────────────────────────────────────────
export function HistoryChart({ history }: { history: ScoreHistory[] }) {
  const data = [...history].reverse().map((h) => ({
    date: new Date(h.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: parseFloat(h.compositeScore),
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b63ed" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b63ed" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fill: "#475569", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            background: "#0d1117",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#94a3b8" }}
          itemStyle={{ color: "#3b63ed" }}
        />
        <Area type="monotone" dataKey="score" stroke="#3b63ed" strokeWidth={2} fill="url(#chartGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export { AnimatePresence, motion };
