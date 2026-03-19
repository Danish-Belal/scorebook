"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, CheckCircle, AlertCircle, Loader2, ExternalLink, ChevronRight, Info } from "lucide-react";
import { platformsApi } from "@/lib/api";
import { PLATFORMS, PlatformKey, PLATFORM_EXAMPLES } from "@/lib/constants";
import Navbar from "@/components/layout/Navbar";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const PLATFORM_LIST = Object.entries(PLATFORMS) as [PlatformKey, typeof PLATFORMS[PlatformKey]][];

export default function ConnectPage() {
  const router = useRouter();
  const [url, setUrl]         = useState("");
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);
  const [success, setSuccess]  = useState<string | null>(null);
  const [error, setError]      = useState<string | null>(null);

  const detectPlatform = (val: string) => {
    setUrl(val);
    setError(null);
    setSuccess(null);
    const found = Object.keys(PLATFORMS).find(k => {
      if (k === "codeforces"  && val.includes("codeforces.com"))    return true;
      if (k === "leetcode"    && val.includes("leetcode.com"))       return true;
      if (k === "github"      && val.includes("github.com"))         return true;
      if (k === "atcoder"     && val.includes("atcoder.jp"))         return true;
      if (k === "gfg"         && val.includes("geeksforgeeks.org"))  return true;
      if (k === "codechef"    && val.includes("codechef.com"))       return true;
      if (k === "hackerrank"  && val.includes("hackerrank.com"))     return true;
      if (k === "hackerearth" && val.includes("hackerearth.com"))    return true;
      if (k === "topcoder"    && val.includes("topcoder.com"))       return true;
    });
    setDetected(found || null);
  };

  const handleConnect = async () => {
    if (!url.trim()) { setError("Please enter a profile URL"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await platformsApi.connect(url.trim());
      setSuccess(`${res.platform} connected! Fetching your data in the background...`);
      toast.success(`${res.platform} profile connected successfully`);
      setUrl("");
      setDetected(null);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (e: any) {
      setError(e.message || "Failed to connect platform");
      toast.error(e.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const prefill = (example: string) => {
    setUrl(example);
    detectPlatform(example);
  };

  return (
    <div className="min-h-screen mesh-bg">
      <Navbar />
      <div className="pt-20 pb-12 max-w-4xl mx-auto px-6">

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="text-2xl font-bold mb-1">Connect a Platform</h1>
          <p className="text-slate-400 text-sm">Paste your profile URL — we auto-detect the platform</p>
        </motion.div>

        {/* URL Input */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 border border-white/5 mb-6">

          <label className="text-sm font-medium text-slate-300 mb-3 block">Profile URL</label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={url}
                onChange={e => detectPlatform(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConnect()}
                placeholder="https://codeforces.com/profile/tourist"
                className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/60 focus:bg-white/8 transition-all"
              />
            </div>
            <button onClick={handleConnect} disabled={loading || !url.trim()}
              className="px-6 py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white transition-all glow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 min-w-[120px] justify-center">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Connecting...</> : <>Connect <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>

          {/* Detected platform badge */}
          <AnimatePresence>
            {detected && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                <span>Detected: <strong>{PLATFORMS[detected as PlatformKey]?.name}</strong></span>
              </motion.div>
            )}
            {success && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-3 flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {success}
              </motion.div>
            )}
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-3 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>After connecting, we&apos;ll fetch your public stats in the background. Score updates within a few minutes. You can connect multiple platforms.</span>
          </div>
        </motion.div>

        {/* Platform cards with example URLs */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Supported Platforms</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PLATFORM_LIST.map(([key, meta], i) => (
              <motion.div key={key}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`glass glass-hover rounded-xl p-4 border cursor-pointer group transition-all ${
                  detected === key ? "border-brand-500/40 bg-brand-500/5" : "border-white/5"
                }`}
                onClick={() => prefill(PLATFORM_EXAMPLES[key])}>

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{meta.emoji}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{meta.name}</h3>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                        meta.tier === "S" ? "text-blue-400"    :
                        meta.tier === "A" ? "text-emerald-400" :
                        meta.tier === "B" ? "text-amber-400"   : "text-slate-400"
                      }`}>{meta.tier}-Tier · {meta.weight}% weight</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>

                <p className="text-xs text-slate-600 font-mono truncate group-hover:text-slate-500 transition-colors">
                  {PLATFORM_EXAMPLES[key].replace("https://", "")}
                </p>
                <p className="text-xs text-brand-500/60 mt-2 group-hover:text-brand-400 transition-colors">
                  Click to use as example →
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
