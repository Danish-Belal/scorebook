"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Search, ChevronLeft, ChevronRight, UserCircle } from "lucide-react";
import { scoresApi, LeaderboardEntry, authApi, User, ApiError, RankResponse } from "@/lib/api";
import { formatScore, getScoreColor } from "@/lib/constants";
import Navbar from "@/components/layout/Navbar";

const PLATFORM_FILTERS = [
  { value: "",            label: "Overall" },
  { value: "codeforces",  label: "Codeforces" },
  { value: "leetcode",    label: "LeetCode" },
  { value: "github",      label: "GitHub" },
  { value: "codechef",    label: "CodeChef" },
  { value: "atcoder",     label: "AtCoder" },
];

export default function LeaderboardPage() {
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [platform, setPlatform] = useState("");
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [me, setMe]             = useState<User | null>(null);
  const [myRank, setMyRank]     = useState<RankResponse | null>(null);

  const PAGE_LIMIT = 25;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user } = await authApi.getMe();
        if (cancelled) return;
        setMe(user);
        try {
          const r = await scoresApi.getRank(user.id);
          if (!cancelled) setMyRank(r);
        } catch (e) {
          if (!cancelled && e instanceof ApiError && e.status === 404) setMyRank(null);
        }
      } catch {
        if (!cancelled) {
          setMe(null);
          setMyRank(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = async (p: number, plat: string) => {
    setLoading(true);
    try {
      const r = await scoresApi.getLeaderboard({ page: p, limit: PAGE_LIMIT, platform: plat || undefined });
      setEntries(r.entries);
      setTotal(r.pagination.totalUsers);
      setPages(r.pagination.totalPages);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page, platform); }, [page, platform]);

  const filtered = entries.filter(e =>
    !search || e.displayName.toLowerCase().includes(search.toLowerCase()) ||
    e.githubLogin?.toLowerCase().includes(search.toLowerCase())
  );

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return { icon: "👑", cls: "text-yellow-400" };
    if (rank === 2) return { icon: "🥈", cls: "text-slate-300" };
    if (rank === 3) return { icon: "🥉", cls: "text-amber-600" };
    return { icon: `#${rank}`, cls: "text-slate-400 font-mono text-sm" };
  };

  return (
    <div className="min-h-screen mesh-bg">
      <Navbar />
      <div className="pt-20 pb-12 max-w-5xl mx-auto px-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Global Leaderboard</h1>
              <p className="text-slate-500 text-sm">{total} developers ranked</p>
            </div>
          </div>
        </motion.div>

        {/* Signed-in: always show your name + overall rank (global composite) */}
        {me && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 glass rounded-2xl border border-brand-500/25 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {me.avatarUrl ? (
                <img src={me.avatarUrl} alt="" className="w-12 h-12 rounded-full ring-2 ring-brand-500/40 shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-brand-500/25 flex items-center justify-center text-lg font-bold text-brand-300 shrink-0">
                  {me.displayName?.[0] ?? <UserCircle className="w-7 h-7 text-brand-400" />}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-400/90">You</p>
                <p className="text-lg font-bold text-white truncate">{me.displayName}</p>
                {myRank ? (
                  <p className="text-sm text-slate-400 mt-0.5">
                    Overall rank{" "}
                    <span className="text-white font-semibold">#{myRank.rank}</span>
                    {" "}of {myRank.totalUsers.toLocaleString()}
                    {(() => {
                      const self = myRank.neighbors.find((n) => n.userId === me.id);
                      if (!self) return null;
                      return (
                        <span className="text-slate-500">
                          {" · "}
                          <span className={`font-mono font-bold ${getScoreColor(self.score)}`}>
                            {formatScore(self.score)}
                          </span>
                        </span>
                      );
                    })()}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500 mt-0.5">
                    You’re not on the global leaderboard yet — connect platforms and run a sync so your score is computed.
                  </p>
                )}
              </div>
            </div>
            {myRank && !platform && (
              <button
                type="button"
                onClick={() => {
                  const target = Math.max(1, Math.ceil(myRank.rank / PAGE_LIMIT));
                  setPage(target);
                }}
                className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/35 hover:bg-brand-500/30 transition-colors"
              >
                Jump to my page
              </button>
            )}
            {platform && myRank && (
              <p className="text-xs text-slate-500 shrink-0 max-w-xs">
                Rank above is your <span className="text-slate-400">overall</span> position. The table shows the selected platform only.
              </p>
            )}
          </motion.div>
        )}

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {PLATFORM_FILTERS.map(f => (
              <button key={f.value}
                onClick={() => { setPlatform(f.value); setPage(1); }}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  platform === f.value
                    ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                    : "text-slate-400 border-white/10 hover:border-white/20 hover:text-white"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search developer..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 transition-colors" />
          </div>
        </div>

        {/* Table */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="glass rounded-2xl overflow-hidden border border-white/5">

          {/* Column headers */}
          <div className="grid grid-cols-12 px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-white/5">
            <span className="col-span-1">Rank</span>
            <span className="col-span-5">Developer</span>
            <span className="col-span-2 text-right">Score</span>
            <span className="col-span-2 text-right">Standing</span>
            <span className="col-span-2 text-right">Platforms</span>
          </div>

          {loading ? (
            <div className="space-y-px">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-16 skeleton mx-4 my-1 rounded-xl" />
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={`${platform}-${page}`}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {filtered.map((entry, i) => {
                  const { icon, cls } = getRankDisplay(entry.rank);
                  return (
                    <motion.div key={entry.userId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`grid grid-cols-12 px-6 py-4 items-center border-b border-white/3 last:border-0 hover:bg-white/2 transition-colors ${
                        entry.rank <= 3 ? "bg-gradient-to-r from-yellow-500/3 to-transparent" : ""
                      } ${
                        me?.id === entry.userId
                          ? "ring-1 ring-inset ring-brand-500/50 bg-brand-500/5"
                          : ""
                      }`}>

                      {/* Rank */}
                      <div className={`col-span-1 text-xl font-bold ${cls}`}>{icon}</div>

                      {/* Developer */}
                      <div className="col-span-5 flex items-center gap-3">
                        {entry.avatarUrl ? (
                          <img src={entry.avatarUrl} alt="" className="w-9 h-9 rounded-full ring-1 ring-white/10" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-400">
                            {entry.displayName[0]}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                            {entry.displayName}
                            {me?.id === entry.userId && (
                              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-brand-500/25 text-brand-300 border border-brand-500/35">
                                You
                              </span>
                            )}
                          </p>
                          {entry.githubLogin ? (
                            <p className="text-xs text-slate-500">@{entry.githubLogin}</p>
                          ) : (
                            <p className="text-xs text-slate-600">ScoreBook member</p>
                          )}
                        </div>
                      </div>

                      {/* Score */}
                      <div className={`col-span-2 text-right font-black font-mono text-lg ${getScoreColor(entry.score)}`}>
                        {formatScore(entry.score)}
                      </div>

                      {/* Top % */}
                      <div className="col-span-2 text-right">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/25">
                          {entry.topPercent}
                        </span>
                      </div>

                      {/* Platform scores */}
                      <div className="col-span-2 flex items-center justify-end gap-1.5">
                        {entry.codeforcesScore != null && (
                          <div title={`CF: ${entry.codeforcesScore.toFixed(1)}`}
                            className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-mono">
                            {entry.codeforcesScore.toFixed(0)}
                          </div>
                        )}
                        {entry.leetcodeScore != null && (
                          <div title={`LC: ${entry.leetcodeScore.toFixed(1)}`}
                            className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono">
                            {entry.leetcodeScore.toFixed(0)}
                          </div>
                        )}
                        {entry.githubScore != null && (
                          <div title={`GH: ${entry.githubScore.toFixed(1)}`}
                            className="text-xs px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400 font-mono">
                            {entry.githubScore.toFixed(0)}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-slate-500">
              Page {page} of {pages} · {total} developers
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-lg glass glass-hover border border-white/8 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[...Array(Math.min(5, pages))].map((_, i) => {
                const p = i + 1;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                      page === p ? "bg-brand-500 text-white glow-sm" : "glass glass-hover text-slate-400 border border-white/8"
                    }`}>{p}</button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="p-2 rounded-lg glass glass-hover border border-white/8 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
