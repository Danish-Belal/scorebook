"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, TrendingUp, Loader2, ArrowLeft } from "lucide-react";
import { scoresApi, MyScoreResponse, ScoreHistory, ApiError } from "@/lib/api";
import { PLATFORMS, PlatformKey, getScoreColor, getRankBadge } from "@/lib/constants";
import Navbar from "@/components/layout/Navbar";
import { ScoreRing, PlatformCard, HistoryChart } from "@/components/dashboard/DashboardVisuals";
import { isLikelyPublicProfileSegment, normalizePublicProfileSegment } from "@/lib/publicProfilePath";

function PublicProfileBackLink() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  if (from === "leaderboard") {
    return (
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to leaderboard
        </Link>
      </div>
    );
  }
  if (from === "home") {
    return (
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    );
  }
  return null;
}

function SuspendedPublicProfileBackLink() {
  return (
    <Suspense fallback={null}>
      <PublicProfileBackLink />
    </Suspense>
  );
}

export default function PublicProfilePage() {
  const params = useParams();
  const rawSegment = typeof params.userId === "string" ? params.userId : "";
  const userId = normalizePublicProfileSegment(rawSegment);

  const [score, setScore] = useState<MyScoreResponse | null>(null);
  const [history, setHistory] = useState<ScoreHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !isLikelyPublicProfileSegment(rawSegment)) {
      setLoading(false);
      setError("invalid");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    scoresApi
      .getPublicProfile(userId, { includeHistory: true })
      .then((s) => {
        if (cancelled) return;
        setScore(s);
        setHistory(s.history ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setError("notfound");
        else if (e instanceof ApiError && e.status === 400) setError("invalid");
        else setError("unknown");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, rawSegment]);

  if (!userId || !isLikelyPublicProfileSegment(rawSegment) || error === "invalid") {
    return (
      <div className="min-h-screen mesh-bg">
        <Navbar />
        <SuspendedPublicProfileBackLink />
        <div className="pt-28 max-w-lg mx-auto px-6 text-center">
          <h1 className="text-xl font-bold text-white mb-2">Invalid profile link</h1>
          <p className="text-slate-400 text-sm mb-6">This URL doesn&apos;t look like a valid ScoreBook profile id.</p>
          <Link href="/" className="text-brand-400 hover:text-brand-300 text-sm font-medium">
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen mesh-bg">
        <Navbar />
        <SuspendedPublicProfileBackLink />
        <div className="pt-28 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
          <p className="text-sm text-slate-400">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (error === "notfound" || !score) {
    return (
      <div className="min-h-screen mesh-bg">
        <Navbar />
        <SuspendedPublicProfileBackLink />
        <div className="pt-28 max-w-lg mx-auto px-6 text-center">
          <h1 className="text-xl font-bold text-white mb-2">Profile not available</h1>
          <p className="text-slate-400 text-sm mb-6">
            This profile doesn&apos;t exist or is set to <strong className="text-slate-300">private</strong>.
          </p>
          <Link href="/" className="text-brand-400 hover:text-brand-300 text-sm font-medium">
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  if (error === "unknown") {
    return (
      <div className="min-h-screen mesh-bg">
        <Navbar />
        <SuspendedPublicProfileBackLink />
        <div className="pt-28 max-w-lg mx-auto px-6 text-center">
          <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-slate-400 text-sm mb-6">Couldn&apos;t load this profile. Try again later.</p>
          <Link href="/" className="text-brand-400 hover:text-brand-300 text-sm font-medium">
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  const connectedPlatforms = Object.keys(score.platforms || {});
  const rankBadge = score.rank ? getRankBadge(score.rank) : null;
  const hasScore = score.compositeScore > 0;

  return (
    <div className="min-h-screen mesh-bg">
      <Navbar />
      <SuspendedPublicProfileBackLink />
      <div className="pt-16 pb-16 max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8"
        >
          <div>
            <p className="text-slate-500 text-sm mb-1">Public ScoreBook profile</p>
            <h1 className="text-2xl font-bold text-white">{score.displayName ?? "Developer"}</h1>
            <p className="text-xs text-slate-500 mt-2 max-w-xl">
              Read-only view.{" "}
              <Link href="/signup" className="text-brand-400 hover:text-brand-300">
                Create your own profile →
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/leaderboard"
              className="text-sm px-4 py-2 rounded-lg glass border border-white/10 text-slate-300 hover:text-white transition-colors"
            >
              Leaderboard
            </Link>
          </div>
        </motion.div>

        {!hasScore && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-2xl p-12 text-center border border-white/5"
          >
            <Trophy className="w-12 h-12 text-brand-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">No public score yet</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              {score.message ?? "This user hasn’t published a composite score on ScoreBook yet."}
            </p>
          </motion.div>
        )}

        {hasScore && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass rounded-2xl p-6 border border-brand-500/20 relative overflow-hidden"
              >
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
                {score.rank && rankBadge && (
                  <div
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${rankBadge.color} mb-3`}
                  >
                    <span className="text-xs font-medium">Rank on ScoreBook</span>
                    <span className="font-bold">
                      {rankBadge.label}{" "}
                      <span className="font-normal text-xs opacity-70">of {score.totalUsers}</span>
                    </span>
                  </div>
                )}
                {score.titles && score.titles.length > 0 && (
                  <div className="space-y-2">
                    {score.titles.map((t) => (
                      <div key={t.platform} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/3">
                        <span className="text-xs text-slate-400">{PLATFORMS[t.platform as PlatformKey]?.name}</span>
                        <span className="text-xs font-semibold text-white">{t.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {score.potentialNote && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                    <TrendingUp className="w-3 h-3 inline mr-1.5" />
                    {score.potentialNote}
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="glass rounded-2xl p-5 border border-white/5"
              >
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Score Breakdown</p>
                <div className="space-y-3">
                  {[
                    {
                      label: "Problem Solving",
                      key: "codeforces",
                      score: Math.max(
                        ...["codeforces", "leetcode", "codechef", "atcoder", "topcoder"].map(
                          (p) => score.breakdown[p] || 0
                        )
                      ),
                    },
                    { label: "Engineering", key: "github", score: score.breakdown.github || 0 },
                    {
                      label: "Breadth",
                      key: "hackerrank",
                      score: Math.max(...["hackerrank", "hackerearth", "gfg"].map((p) => score.breakdown[p] || 0)),
                    },
                  ].map(({ label, score: s }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-400">{label}</span>
                        <span className={`font-mono font-bold ${getScoreColor(s)}`}>{s.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${s}%` }}
                          transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
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

              {history.length > 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="glass rounded-2xl p-5 border border-white/5"
                >
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Score History</p>
                  <HistoryChart history={history} />
                </motion.div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Platforms ({connectedPlatforms.length})
                </p>
              </div>
              {connectedPlatforms.length === 0 ? (
                <div className="glass rounded-xl p-8 text-center border border-white/5 border-dashed text-slate-400 text-sm">
                  No platform cards to show.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AnimatePresence>
                    {connectedPlatforms.map((key, i) => (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                      >
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
