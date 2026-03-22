"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy, Zap, GitBranch, Shield, ChevronRight, Users, Activity, Award, LayoutDashboard, Plus } from "lucide-react";
import { scoresApi, LeaderboardEntry, authApi, User } from "@/lib/api";
import { PLATFORMS } from "@/lib/constants";
import Navbar from "@/components/layout/Navbar";
import AvatarImg from "@/components/AvatarImg";

const PLATFORM_LIST = Object.entries(PLATFORMS);

export default function LandingPage() {
  const [topUsers, setTopUsers] = useState<LeaderboardEntry[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    scoresApi.getLeaderboard({ page: 1, limit: 5 }).then(r => {
      setTopUsers(r.entries);
      setTotalUsers(r.pagination.totalUsers);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    authApi.getMe().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  return (
    <div className="min-h-screen mesh-bg">
      <Navbar />

      {/* ── Hero ── */}
      <section className="pt-28 md:pt-36 pb-24 px-6 text-center relative overflow-hidden">
        {/* Orbs */}
        <div className="absolute top-32 left-1/4 w-96 h-96 rounded-full bg-brand-500/8 blur-3xl pointer-events-none" />
        <div className="absolute top-48 right-1/4 w-64 h-64 rounded-full bg-purple-500/6 blur-3xl pointer-events-none" />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-400 text-xs font-medium mb-8">
            <Zap className="w-3 h-3" />
            <span>9 platforms · Fair percentile scoring · Live rankings</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-none">
            <span className="gradient-text">The developer</span>
            <br />
            <span className="gradient-text-brand">score you deserve</span>
          </h1>

          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            One fair score across Codeforces, LeetCode, GitHub, CodeChef and 5 more platforms.
            See exactly where you stand among every developer on our platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <>
                <Link href="/dashboard"
                   className="group px-8 py-4 rounded-xl font-semibold bg-brand-500 hover:bg-brand-600 transition-all glow-brand text-white flex items-center gap-2 text-base">
                  <LayoutDashboard className="w-4 h-4" />
                  Go to Dashboard
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/connect"
                   className="px-8 py-4 rounded-xl font-semibold glass glass-hover transition-all text-slate-300 hover:text-white flex items-center gap-2 text-base border border-white/8">
                  <Plus className="w-4 h-4" />
                  Add platform
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup"
                   className="group px-8 py-4 rounded-xl font-semibold bg-brand-500 hover:bg-brand-600 transition-all glow-brand text-white flex items-center gap-2 text-base">
                  <GitBranch className="w-4 h-4" />
                  Sign up free
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/leaderboard"
                   className="px-8 py-4 rounded-xl font-semibold glass glass-hover transition-all text-slate-300 hover:text-white flex items-center gap-2 text-base border border-white/8">
                  <Trophy className="w-4 h-4" />
                  View Leaderboard
                </Link>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mt-12 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-400" />
              <span>{totalUsers > 0 ? `${totalUsers} developers ranked` : "Join & get ranked"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Updated every 24h</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              <span>Fair percentile scoring</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Live Leaderboard Preview ── */}
      {topUsers.length > 0 && (
        <section className="px-6 pb-24">
          <div className="max-w-4xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <div className="text-center mb-8">
                <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2">Live Rankings</p>
                <h2 className="text-2xl font-bold">Top Developers Right Now</h2>
              </div>

              <div className="glass rounded-2xl overflow-hidden border border-white/5">
                <div className="grid grid-cols-4 px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-white/5">
                  <span>Rank</span><span>Developer</span><span>Score</span><span>Standing</span>
                </div>
                {topUsers.map((user, i) => (
                  <motion.div key={user.userId}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="grid grid-cols-4 px-6 py-4 items-center border-b border-white/3 last:border-0 hover:bg-white/2 transition-colors">
                    <div className="font-mono font-bold text-sm">
                      {user.rank === 1 ? "👑" : user.rank === 2 ? "🥈" : user.rank === 3 ? "🥉" : `#${user.rank}`}
                    </div>
                    <div className="flex items-center gap-3">
                      <AvatarImg src={user.avatarUrl} name={user.displayName} className="w-8 h-8" />
                      <div>
                        <p className="text-sm font-medium text-white">{user.displayName}</p>
                        {user.githubLogin && <p className="text-xs text-slate-500">@{user.githubLogin}</p>}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-lg text-brand-400">{user.score.toFixed(1)}</div>
                    <div>
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/25">
                        {user.topPercent}
                      </span>
                    </div>
                  </motion.div>
                ))}
                <div className="px-6 py-4 text-center">
                  <Link href="/leaderboard" className="text-sm text-brand-400 hover:text-brand-300 transition-colors font-medium">
                    View full leaderboard →
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Platforms ── */}
      <section id="platforms" className="px-6 py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3">Coverage</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">9 Platforms, One Score</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Every major coding platform weighted by difficulty, prestige, and community quality.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLATFORM_LIST.map(([key, p]) => (
              <motion.div key={key}
                whileHover={{ y: -2 }}
                className={`glass glass-hover rounded-xl p-5 border ${
                  p.tier === 'S' ? 'tier-s' : p.tier === 'A' ? 'tier-a' : p.tier === 'B' ? 'tier-b' : 'tier-c'
                }`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-2xl">{p.emoji}</span>
                    <h3 className="text-base font-semibold mt-1">{p.name}</h3>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      p.tier === 'S' ? 'bg-blue-500/20 text-blue-400' :
                      p.tier === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                      p.tier === 'B' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>{p.tier}-Tier</span>
                    <p className="text-lg font-black text-white mt-1">{p.weight}%</p>
                    <p className="text-xs text-slate-500">weight</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="px-6 py-24 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3">Process</p>
            <h2 className="text-3xl font-bold">Fair scoring, transparently</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: GitBranch, step: "01", title: "Connect your profiles", desc: "Paste your profile URLs from any coding platform. We auto-detect and verify." },
              { icon: Activity,  step: "02", title: "We fetch & score", desc: "Our engine fetches your stats and computes your percentile rank vs every other developer on ScoreBook." },
              { icon: Trophy,    step: "03", title: "See your true rank", desc: "Get a fair composite score and see exactly where you stand — with full breakdown by platform." },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="glass rounded-xl p-6 border border-white/5 relative overflow-hidden">
                <div className="absolute top-4 right-4 font-black text-5xl text-white/3">{step}</div>
                <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-brand-400" />
                </div>
                <h3 className="font-semibold text-base mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA (guests only) ── */}
      {!user && (
        <section className="px-6 py-24 border-t border-white/5">
          <div className="max-w-2xl mx-auto text-center">
            <div className="glass rounded-3xl p-12 border border-brand-500/20 glow-brand relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-purple-500/5 pointer-events-none" />
              <Award className="w-12 h-12 text-brand-400 mx-auto mb-6" />
              <h2 className="text-3xl font-bold mb-4">Ready to see where you rank?</h2>
              <p className="text-slate-400 mb-8">Join developers already on ScoreBook. Takes 30 seconds to get your first score.</p>
              <Link href="/signup"
                 className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold bg-brand-500 hover:bg-brand-600 transition-all text-white glow-sm">
                <GitBranch className="w-4 h-4" />
                Get your score now
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-brand-400" />
            <span className="font-semibold text-slate-300">ScoreBook</span>
            <span>— Developer Intelligence Platform</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/leaderboard" className="hover:text-slate-300 transition-colors">Leaderboard</Link>
            <Link href="/dashboard"   className="hover:text-slate-300 transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
