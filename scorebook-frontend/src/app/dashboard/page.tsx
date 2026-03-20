"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Trophy, TrendingUp, Activity, Plus, ExternalLink, AlertCircle, CheckCircle, Clock, ChevronRight, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { scoresApi, platformsApi, MyScoreResponse, PlatformStatus, ScoreHistory, authApi, ScoreQueueStatusResponse, ApiError } from "@/lib/api";
import { PLATFORMS, PlatformKey, formatScore, getScoreColor, getRankBadge, timeAgo } from "@/lib/constants";
import Navbar from "@/components/layout/Navbar";
import { toast } from "sonner";
import Link from "next/link";

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, lower, upper }: { score: number; lower: number | null; upper: number | null }) {
  const radius = 80;
  const circ   = 2 * Math.PI * radius;
  const fill   = (score / 100) * circ;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="200" height="200" className="score-ring -rotate-90">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        <circle cx="100" cy="100" r={radius} fill="none"
          stroke="url(#scoreGrad)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - fill}
          style={{ transition: "stroke-dashoffset 1s ease-out" }} />
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#3b63ed" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-5xl font-black text-white font-mono">
          {formatScore(score)}
        </motion.span>
        {lower && upper && (
          <span className="text-xs text-slate-500 mt-1">{lower.toFixed(0)} – {upper.toFixed(0)}</span>
        )}
        <span className="text-xs text-slate-400 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// ─── Platform Card ────────────────────────────────────────────────────────────
function PlatformCard({ platformKey, data, score }: { platformKey: string; data: any; score: number | null }) {
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

      {/* Raw stats */}
      {data.rawData && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {platformKey === "codeforces" && data.rawData.userInfo && (
            <>
              <Stat label="Rating"   value={data.rawData.userInfo.rating} />
              <Stat label="Max"      value={data.rawData.userInfo.maxRating} />
              <Stat label="Contests" value={data.rawData.contestsParticipated} />
              <Stat label="Solved"   value={data.rawData.uniqueProblemsSolved} />
            </>
          )}
          {platformKey === "leetcode" && (
            <>
              <Stat label="Contest"  value={data.rawData.contestRating?.toFixed(0)} />
              <Stat label="Hard"     value={data.rawData.hardSolved} />
              <Stat label="Medium"   value={data.rawData.mediumSolved} />
              <Stat label="Streak"   value={`${data.rawData.streak}d`} />
            </>
          )}
          {platformKey === "github" && (
            <>
              <Stat label="PRs"      value={data.rawData.totalMergedPRs} />
              <Stat label="Commits"  value={data.rawData.totalCommitsLastYear} />
              <Stat label="Stars"    value={data.rawData.totalStarsEarned} />
              <Stat label="Days"     value={data.rawData.totalContributionDays} />
            </>
          )}
          {platformKey === "codechef" && (
            <>
              <Stat label="Rating"   value={data.rawData.currentRating} />
              <Stat label="Stars"    value={`${data.rawData.stars}★`} />
            </>
          )}
          {platformKey === "atcoder" && (
            <>
              <Stat label="Rating"   value={data.rawData.rating} />
              <Stat label="Color"    value={data.rawData.rank} />
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

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white/3 rounded-lg p-2">
      <p className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white font-semibold mt-0.5">{value ?? "–"}</p>
    </div>
  );
}

// ─── Score queue status (BullMQ `compute-score`) ─────────────────────────────
function ScoreCalculationCard({
  qs,
  platformCount,
  onScoreAgain,
  refreshing,
  scoringMeta,
}: {
  qs: ScoreQueueStatusResponse | null;
  platformCount: number;
  onScoreAgain: () => void;
  refreshing: boolean;
  /** From /me scoreBreakdown when worker saved a 0 with scoringSkipped */
  scoringMeta?: { reason?: string; note?: string } | null;
}) {
  if (platformCount === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-white/10 mb-8"
      >
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Score calculation</h2>
        <p className="text-sm text-slate-400">Connect at least one platform — then we&apos;ll fetch public stats and run the score worker.</p>
      </motion.section>
    );
  }

  if (!qs) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-brand-500/25 mb-8 flex items-center gap-3"
      >
        <Loader2 className="w-6 h-6 animate-spin text-brand-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-white">Checking Redis / task queue…</p>
          <p className="text-xs text-slate-500 mt-0.5">Queue: compute-score</p>
        </div>
      </motion.section>
    );
  }

  const { job, platformFetch, database } = qs;
  const st = job.bullmqState;
  const failed = st === "failed";
  const scoring = ["waiting", "delayed", "active", "paused"].includes(st);
  const fetching = platformFetch.pending > 0;
  /** Never treat "completed + no row" as in-progress — worker already finished (old bug: early return 0 skipped DB). */
  const completedButNoRow = st === "completed" && !database.hasScoreRow;
  const processing = fetching || scoring || st === "unknown";

  const hasGoodScore = database.hasScoreRow && (database.compositeScore ?? 0) > 0;
  const zeroScoreSaved = database.hasScoreRow && (database.compositeScore ?? 0) <= 0;
  const stuckNoScore =
    !failed &&
    !processing &&
    !database.hasScoreRow &&
    platformFetch.success > 0;

  const shortJobId = job.jobId.length > 28 ? `${job.jobId.slice(0, 14)}…${job.jobId.slice(-8)}` : job.jobId;

  if (completedButNoRow) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-amber-500/30 bg-amber-500/5 mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex gap-3 min-w-0">
            <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Job finished — DB not updated</h2>
              <p className="text-sm text-slate-400 max-w-xl mb-2">
                BullMQ reports <span className="text-slate-300">completed</span> (job result {job.resultFinalScore ?? "—"})
                but Postgres still has no <code className="text-xs text-slate-500">scores</code> row. That usually means an
                older worker exited before writing. Tap <strong>Score again</strong> — we now remove the stale Redis job
                first so a new run can enqueue.
              </p>
              {qs.redisLeaderboard && (
                <p className="text-xs text-slate-500 font-mono mt-2">
                  Redis leaderboard ({qs.redisLeaderboard.key}):{" "}
                  {qs.redisLeaderboard.isMember
                    ? `score = ${qs.redisLeaderboard.globalScore?.toFixed(2) ?? "?"}`
                    : "not a member (no global score stored yet)"}
                </p>
              )}
              <p className="text-xs text-slate-600 font-mono">job {shortJobId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onScoreAgain}
            disabled={refreshing}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Score again
          </button>
        </div>
      </motion.section>
    );
  }

  if (failed) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-red-500/35 bg-red-500/5 mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex gap-3">
            <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Score calculation failed</h2>
              <p className="text-xs text-slate-500 font-mono mb-2">
                Queue <span className="text-slate-400">{job.queueName}</span> · job <span className="text-slate-400">{shortJobId}</span>
              </p>
              <p className="text-sm text-red-300/95 whitespace-pre-wrap break-words">{job.failedReason || "Unknown error from the score worker."}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onScoreAgain}
            disabled={refreshing}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Score again
          </button>
        </div>
      </motion.section>
    );
  }

  if (processing) {
    let line = "Working…";
    if (fetching && scoring) line = "Fetching platform data and calculating your score…";
    else if (fetching) line = "Fetching latest data from your platforms…";
    else if (scoring) line = "Your score is computing in the background…";
    else if (st === "unknown") line = "Task state updating…";

    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-brand-500/35 bg-brand-500/10 mb-8"
      >
        <div className="flex items-start gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Score calculation in progress</h2>
            <p className="text-sm text-slate-200 mb-3">{line}</p>
            <div className="text-xs text-slate-500 space-y-1 font-mono">
              <p>
                Redis queue: <span className="text-brand-300">{job.queueName}</span> · BullMQ state:{" "}
                <span className="text-brand-300">{st}</span>
              </p>
              <p>
                Job id: <span className="text-slate-400">{shortJobId}</span>
              </p>
              <p>
                Platform rows: {platformFetch.success} synced · {platformFetch.pending} pending · {platformFetch.error}{" "}
                errors
              </p>
            </div>
          </div>
        </div>
      </motion.section>
    );
  }

  if (zeroScoreSaved) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-amber-500/25 bg-amber-500/5 mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Score is 0</h2>
            <p className="text-sm text-slate-400 max-w-xl">
              A score row exists but the composite is still 0 — usually not enough usable platform metrics yet. Fix any
              platform errors, re-sync, then try again.
            </p>
            {scoringMeta?.note && (
              <p className="text-xs text-amber-200/80 mt-2 max-w-xl border-l-2 border-amber-500/40 pl-3">
                {scoringMeta.note}
                {scoringMeta.reason && (
                  <span className="block font-mono text-slate-500 mt-1">reason: {scoringMeta.reason}</span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onScoreAgain}
            disabled={refreshing}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Score again
          </button>
        </div>
      </motion.section>
    );
  }

  if (stuckNoScore) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-amber-500/30 bg-amber-500/5 mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Score not saved yet</h2>
            <p className="text-sm text-slate-400 max-w-xl">
              Your platform data looks synced, but there&apos;s no composite score row yet (or the last job never ran). Queue
              the <span className="text-slate-300">compute-score</span> worker again.
            </p>
            {job.hint && st === "idle" && (
              <p className="text-xs text-slate-600 mt-2 font-mono">{job.hint}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onScoreAgain}
            disabled={refreshing}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Score again
          </button>
        </div>
      </motion.section>
    );
  }

  if (hasGoodScore) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-xl px-4 py-3 border border-emerald-500/20 bg-emerald-500/5 mb-8 flex flex-wrap items-center gap-3"
      >
        <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
        <p className="text-sm text-slate-300">
          <span className="text-emerald-400 font-semibold">Score ready</span>
          {database.computedAt && (
            <span className="text-slate-500"> · last computed {timeAgo(String(database.computedAt))}</span>
          )}
        </p>
        <span className="text-[10px] text-slate-600 font-mono ml-auto">queue: {job.queueName}</span>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-6 border border-white/10 mb-8"
    >
      <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Score calculation</h2>
      <p className="text-sm text-slate-400 mb-2">Waiting for platform data. Sync your profiles if this stays empty.</p>
      <p className="text-xs text-slate-600 font-mono">{job.hint}</p>
    </motion.section>
  );
}

// ─── History Chart ────────────────────────────────────────────────────────────
function HistoryChart({ history }: { history: ScoreHistory[] }) {
  const data = [...history].reverse().map(h => ({
    date:  new Date(h.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: parseFloat(h.compositeScore),
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3b63ed" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b63ed" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis domain={["auto", "auto"]} tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
        <Tooltip
          contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#94a3b8" }}
          itemStyle={{ color: "#3b63ed" }}
        />
        <Area type="monotone" dataKey="score" stroke="#3b63ed" strokeWidth={2} fill="url(#chartGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [score, setScore]       = useState<MyScoreResponse | null>(null);
  const [history, setHistory]   = useState<ScoreHistory[]>([]);
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [platformHint, setPlatformHint] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [queueStatus, setQueueStatus] = useState<ScoreQueueStatusResponse | null>(null);
  /** Bump to restart queue-status polling after user queues refresh/sync. */
  const [queuePollEpoch, setQueuePollEpoch] = useState(0);
  /** Reload /me once when a scores row first appears (including composite 0). */
  const prevHadScoreRow = useRef(false);

  const reloadDashboardData = useCallback(() => {
    Promise.all([scoresApi.getMe(), platformsApi.list()])
      .then(([s, p]) => {
        setScore(s);
        setPlatforms(p.platforms);
        setPlatformHint(p.hint ?? null);
        if (s.userId) {
          scoresApi.getHistory(s.userId).then((h) => setHistory(h.history)).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Auth check
    authApi.getMe().catch(() => router.push("/"));
  }, []);

  useEffect(() => {
    Promise.all([
      scoresApi.getMe(),
      platformsApi.list(),
    ]).then(([s, p]) => {
      setScore(s);
      setPlatforms(p.platforms);
      setPlatformHint(p.hint ?? null);
      if (s.userId) {
        scoresApi.getHistory(s.userId).then(h => setHistory(h.history)).catch(() => {});
      }
    }).catch(() => router.push("/"))
    .finally(() => setLoading(false));
  }, []);

  /** Open dashboard with existing session (bookmark): one auto sync+score per tab session */
  useEffect(() => {
    if (loading || platforms.length === 0) return;
    try {
      if (typeof window === "undefined" || sessionStorage.getItem("scorebook_auto_sync_v1")) return;
      sessionStorage.setItem("scorebook_auto_sync_v1", "1");
    } catch {
      return;
    }
    void platformsApi
      .sync()
      .then((r) => {
        setQueuePollEpoch((e) => e + 1);
        if (r.queued > 0) {
          toast.message("Background update started", {
            description: "Fetching your platforms and recalculating your score (~1–3 min).",
          });
        }
        setTimeout(() => reloadDashboardData(), 4000);
        setTimeout(() => reloadDashboardData(), 12000);
      })
      .catch(() => {
        try {
          sessionStorage.removeItem("scorebook_auto_sync_v1");
        } catch {
          /* ignore */
        }
      });
  }, [loading, platforms.length, reloadDashboardData]);

  /**
   * Queue-status: fetch once on start, then only while work may still change.
   * Stops when job is failed/completed, or idle with no pending platform fetches (no ~2s endless loop).
   * Bump `queuePollEpoch` after refresh/sync to resume polling.
   */
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const tick = async () => {
      try {
        const qs = await scoresApi.getQueueStatus();
        if (cancelled) return;
        setQueueStatus(qs);

        const st = qs.job.bullmqState;
        const pendingFetch = qs.platformFetch.pending > 0;
        const jobInFlight =
          st === "waiting" ||
          st === "delayed" ||
          st === "active" ||
          st === "paused" ||
          st === "unknown";

        const done =
          st === "failed" ||
          st === "completed" ||
          (st === "idle" && !pendingFetch);

        if (done) {
          if (st === "completed" || st === "failed") {
            void reloadDashboardData();
          }
          return;
        }

        const delayMs = pendingFetch || jobInFlight ? 4000 : 12000;
        timeoutId = setTimeout(() => void tick(), delayMs);
      } catch {
        if (cancelled) return;
        timeoutId = setTimeout(() => void tick(), 15000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [loading, queuePollEpoch, reloadDashboardData]);

  /** When a scores row appears in DB, refresh full dashboard once (platform cards + breakdown). */
  useEffect(() => {
    if (!queueStatus) return;
    const now = queueStatus.database.hasScoreRow;
    if (now && !prevHadScoreRow.current) {
      reloadDashboardData();
    }
    prevHadScoreRow.current = now;
  }, [queueStatus, reloadDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await scoresApi.refresh();
      toast.success("Score job queued on compute-score — watch the status card above");
      setQueuePollEpoch((e) => e + 1);
      void scoresApi.getQueueStatus().then(setQueueStatus);
      setTimeout(() => reloadDashboardData(), 4000);
      setTimeout(() => reloadDashboardData(), 10000);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Refresh failed";
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const r = await platformsApi.sync();
      toast.success(r.message);
      setPlatformHint(null);
      setQueuePollEpoch((e) => e + 1);
      setTimeout(() => reloadDashboardData(), 3000);
      setTimeout(() => reloadDashboardData(), 8000);
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncingAll(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-16 max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="h-64 skeleton rounded-2xl" />
            <div className="h-40 skeleton rounded-2xl" />
          </div>
          <div className="lg:col-span-2 grid grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-48 skeleton rounded-xl" />)}
          </div>
        </div>
      </div>
    </div>
  );

  const connectedPlatforms = Object.keys(score?.platforms || {});
  const rankBadge = score?.rank ? getRankBadge(score.rank) : null;

  return (
    <div className="min-h-screen mesh-bg">
      <Navbar />
      <div className="pt-20 pb-12 max-w-7xl mx-auto px-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8">
          <div>
            <p className="text-slate-500 text-sm mb-1">Welcome back</p>
            <h1 className="text-2xl font-bold text-white">{score?.displayName || "Developer"}</h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {platforms.length > 0 && (
              <button
                type="button"
                onClick={handleSyncAll}
                disabled={syncingAll}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium text-white border border-white/10 transition-all disabled:opacity-50"
              >
                <Activity className={`w-4 h-4 ${syncingAll ? "animate-pulse" : ""}`} />
                {syncingAll ? "Queuing sync…" : "Re-sync all data"}
              </button>
            )}
            <button onClick={() => void handleRefresh()} disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg glass glass-hover text-sm font-medium text-slate-300 border border-white/8 transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh score"}
            </button>
            <Link href="/connect"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white transition-all glow-sm">
              <Plus className="w-4 h-4" />
              Add Platform
            </Link>
          </div>
        </motion.div>

        <ScoreCalculationCard
          qs={queueStatus}
          platformCount={platforms.length}
          onScoreAgain={() => void handleRefresh()}
          refreshing={refreshing}
          scoringMeta={
            score?.detailedBreakdown &&
            typeof score.detailedBreakdown === "object" &&
            (score.detailedBreakdown as { scoringSkipped?: boolean }).scoringSkipped
              ? {
                  reason: (score.detailedBreakdown as { reason?: string }).reason,
                  note: (score.detailedBreakdown as { note?: string }).note,
                }
              : null
          }
        />

        {/* Saved profile links — always visible when you’ve connected anything */}
        {platforms.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6 border border-white/8 mb-8"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Your connected platforms</h2>
                <p className="text-sm text-slate-400 mt-1 max-w-xl">
                  These profile URLs are saved on your account. <strong className="text-slate-300">Re-sync all data</strong> pulls fresh public stats and queues score calculation (typically <strong className="text-slate-300">1–3 minutes</strong> after sync succeeds).
                </p>
              </div>
            </div>
            {platformHint && (
              <p className="text-xs text-amber-400/95 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 mb-4">
                {platformHint}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {platforms.map((p) => (
                <a
                  key={p.platform}
                  href={p.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass rounded-xl p-4 border border-white/6 hover:border-brand-500/35 transition-all group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-sm text-white">{p.displayName}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0" />
                  </div>
                  <p className="text-xs text-slate-500 font-mono truncate">@{p.username}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {p.fetchStatus === "success" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        Synced
                      </span>
                    )}
                    {p.fetchStatus === "pending" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 animate-pulse">
                        Pending
                      </span>
                    )}
                    {p.fetchStatus === "error" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                        Error
                      </span>
                    )}
                    {p.recoverableSyncError && (
                      <span className="text-[10px] text-slate-500">→ use Re-sync</span>
                    )}
                  </div>
                  {p.fetchStatus === "error" && p.errorMessage && (
                    <p className="text-[10px] text-red-400/80 mt-2 line-clamp-2">{p.errorMessage}</p>
                  )}
                </a>
              ))}
            </div>
          </motion.section>
        )}

        {/* No platforms linked yet */}
        {platforms.length === 0 && !(score && score.compositeScore > 0) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="glass rounded-2xl p-12 text-center border border-white/5 mb-8">
            <Trophy className="w-12 h-12 text-brand-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Connect your first platform</h2>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Add your Codeforces, LeetCode, or GitHub profile to get your score.
            </p>
            <Link href="/connect"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 font-semibold text-white transition-all glow-sm">
              <Plus className="w-4 h-4" />
              Connect a platform
            </Link>
          </motion.div>
        )}

        {/* Linked profiles but score not computed yet */}
        {platforms.length > 0 && score && score.compositeScore <= 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-xl p-5 border border-brand-500/20 bg-brand-500/5 mb-8"
          >
            <p className="text-sm text-slate-300">
              When each card above shows <span className="text-emerald-400 font-medium">Synced</span>, your composite score is calculated automatically. If you still see errors, use <strong>Re-sync all data</strong> (server must include the queue fix), then wait a few minutes.
            </p>
          </motion.div>
        )}

        {score != null && score.compositeScore > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Left: Score Overview ── */}
            <div className="lg:col-span-1 space-y-4">

              {/* Main score card */}
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="glass rounded-2xl p-6 border border-brand-500/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-500/8 to-purple-500/5 pointer-events-none" />

                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Overall Score</p>
                  {score.topPercent && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                      {score.topPercent}
                    </span>
                  )}
                </div>

                <div className="flex justify-center my-4">
                  <ScoreRing score={score.compositeScore} lower={score.scoreLower} upper={score.scoreUpper} />
                </div>

                {/* Rank */}
                {score.rank && rankBadge && (
                  <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${rankBadge.color} mb-3`}>
                    <span className="text-xs font-medium">Your rank</span>
                    <span className="font-bold">{rankBadge.label} <span className="font-normal text-xs opacity-70">of {score.totalUsers}</span></span>
                  </div>
                )}

                {/* Titles */}
                {score.titles?.length > 0 && (
                  <div className="space-y-2">
                    {score.titles.map(t => (
                      <div key={t.platform} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/3">
                        <span className="text-xs text-slate-400">{PLATFORMS[t.platform as PlatformKey]?.name}</span>
                        <span className="text-xs font-semibold text-white">{t.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Potential */}
                {score.potentialNote && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                    <TrendingUp className="w-3 h-3 inline mr-1.5" />
                    {score.potentialNote}
                  </div>
                )}
              </motion.div>

              {/* Score components */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                className="glass rounded-2xl p-5 border border-white/5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Score Breakdown</p>
                <div className="space-y-3">
                  {[
                    { label: "Problem Solving", key: "codeforces", score: Math.max(...["codeforces","leetcode","codechef","atcoder","topcoder"].map(p => score.breakdown[p] || 0)) },
                    { label: "Engineering",     key: "github",     score: score.breakdown.github || 0 },
                    { label: "Breadth",         key: "hackerrank", score: Math.max(...["hackerrank","hackerearth","gfg"].map(p => score.breakdown[p] || 0)) },
                  ].map(({ label, score: s }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-400">{label}</span>
                        <span className={`font-mono font-bold ${getScoreColor(s)}`}>{s.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${s}%` }}
                          transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Recency / confidence */}
                <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white/3 rounded-lg p-2.5 text-center">
                    <p className="text-slate-500 mb-0.5">Activity</p>
                    <p className="font-bold text-white">{((score.recencyFactor || 0) * 100).toFixed(0)}%</p>
                  </div>
                  <div className="bg-white/3 rounded-lg p-2.5 text-center">
                    <p className="text-slate-500 mb-0.5">Confidence</p>
                    <p className="font-bold text-white">{((score.confidenceFactor || 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </motion.div>

              {/* History chart */}
              {history.length > 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                  className="glass rounded-2xl p-5 border border-white/5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Score History</p>
                  <HistoryChart history={history} />
                </motion.div>
              )}
            </div>

            {/* ── Right: Platform Cards ── */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Connected Platforms ({connectedPlatforms.length})
                </p>
                <Link href="/connect" className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1">
                  Add more <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {connectedPlatforms.length === 0 ? (
                <div className="glass rounded-xl p-8 text-center border border-white/5 border-dashed">
                  <Plus className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">No platforms connected yet</p>
                  <Link href="/connect" className="text-brand-400 text-sm mt-2 inline-block hover:text-brand-300">
                    Connect your first platform →
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AnimatePresence>
                    {connectedPlatforms.map((key, i) => (
                      <motion.div key={key}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}>
                        <PlatformCard
                          platformKey={key}
                          data={score.platforms[key]}
                          score={score.breakdown[key] || null}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Platform fetch statuses */}
              {platforms.some(p => p.fetchStatus !== "success") && (
                <div className="mt-4 space-y-2">
                  {platforms.filter(p => p.fetchStatus !== "success").map(p => (
                    <div key={p.platform} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
                      p.fetchStatus === "error" ? "bg-red-500/5 border-red-500/20 text-red-400" : "bg-amber-500/5 border-amber-500/20 text-amber-400"
                    }`}>
                      {p.fetchStatus === "error"   ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> :
                       p.fetchStatus === "pending" ? <Clock className="w-4 h-4 flex-shrink-0 animate-pulse" /> :
                       <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                      <span>{p.displayName}: {p.fetchStatus === "error" ? p.errorMessage || "Fetch failed" : "Fetching data..."}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
