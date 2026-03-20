"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, CheckCircle, AlertCircle, Loader2, ExternalLink, ChevronRight, Info, ListPlus, Pencil } from "lucide-react";
import { platformsApi, PlatformStatus } from "@/lib/api";
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

  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  /** Linked platforms from API (for “already connected” UX) */
  const [connectedByPlatform, setConnectedByPlatform] = useState<
    Partial<Record<PlatformKey, PlatformStatus>>
  >({});
  /** When set, user opened a card for an already-linked platform */
  const [connectedBanner, setConnectedBanner] = useState<string | null>(null);
  /** URL we had on file when user clicked “connected” card (to label Update vs Re-fetch) */
  const [savedUrlForEdit, setSavedUrlForEdit] = useState<string | null>(null);

  const refreshConnected = () => {
    platformsApi
      .list()
      .then(({ platforms }) => {
        const map: Partial<Record<PlatformKey, PlatformStatus>> = {};
        for (const p of platforms) {
          const k = p.platform as PlatformKey;
          if (k in PLATFORMS) map[k] = p;
        }
        setConnectedByPlatform(map);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshConnected();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("welcome");
    if (q === "1") {
      toast.message("Add your platforms", {
        description: "Paste one profile URL at a time, or use the bulk box below for many links at once.",
      });
      window.history.replaceState({}, "", "/connect");
    }
  }, []);

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
      const isUpdate = savedUrlForEdit !== null;
      setSuccess(
        isUpdate
          ? `${res.platform} updated! Re-fetching your data in the background...`
          : `${res.platform} connected! Fetching your data in the background...`
      );
      toast.success(isUpdate ? `${res.platform} profile updated` : `${res.platform} profile connected successfully`);
      setConnectedBanner(null);
      setSavedUrlForEdit(null);
      setUrl("");
      setDetected(null);
      refreshConnected();
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (e: any) {
      setError(e.message || "Failed to connect platform");
      toast.error(e.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const prefill = (example: string) => {
    setConnectedBanner(null);
    setSavedUrlForEdit(null);
    setUrl(example);
    detectPlatform(example);
  };

  const openConnectedPlatform = (key: PlatformKey, status: PlatformStatus) => {
    setError(null);
    setSuccess(null);
    setConnectedBanner(
      `You’ve already connected ${PLATFORMS[key].name}. Your profile URL is below — edit it and save to update, or re-fetch with the same URL.`
    );
    setSavedUrlForEdit(status.profileUrl);
    setUrl(status.profileUrl);
    setDetected(key);
    requestAnimationFrame(() => {
      document.getElementById("connect-url-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handlePlatformCardClick = (key: PlatformKey) => {
    const linked = connectedByPlatform[key];
    if (linked) openConnectedPlatform(key, linked);
    else prefill(PLATFORM_EXAMPLES[key]);
  };

  const handleBulkConnect = async () => {
    const lines = bulkText
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("Add at least one URL (one per line)");
      return;
    }
    setBulkLoading(true);
    setBulkResult(null);
    let ok = 0;
    const failures: string[] = [];
    for (const line of lines) {
      try {
        await platformsApi.connect(line);
        ok += 1;
        await new Promise((r) => setTimeout(r, 350));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed";
        failures.push(`${line.slice(0, 48)}… — ${msg}`);
      }
    }
    setBulkLoading(false);
    setBulkResult(`Connected ${ok} of ${lines.length}.`);
    if (ok > 0) toast.success(`Queued ${ok} profile(s) — scores update in a few minutes`);
    if (failures.length) {
      toast.error(`${failures.length} URL(s) failed`);
      setBulkResult(`Connected ${ok} of ${lines.length}. ${failures.length} failed — check URLs.`);
    }
    setBulkText("");
    if (ok > 0) {
      refreshConnected();
      setTimeout(() => router.push("/dashboard"), 2200);
    }
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
        <motion.div id="connect-url-section" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 border border-white/5 mb-6 scroll-mt-24">

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
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
              ) : savedUrlForEdit ? (
                url.trim() === savedUrlForEdit.trim() ? (
                  <>Re-fetch data <ChevronRight className="w-4 h-4" /></>
                ) : (
                  <>Update & sync <ChevronRight className="w-4 h-4" /></>
                )
              ) : (
                <>Connect <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>

          {/* Detected platform badge */}
          <AnimatePresence>
            {connectedBanner && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 flex items-start gap-2 text-sm text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-xl px-4 py-3"
              >
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{connectedBanner}</span>
              </motion.div>
            )}
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

        {/* Bulk URLs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-6 border border-white/5 mb-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <ListPlus className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold">Add many platforms at once</h2>
          </div>
          <p className="text-slate-400 text-sm mb-4">
            Paste one profile URL per line (Codeforces, LeetCode, GitHub, etc.). We connect each in order.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={
              "https://codeforces.com/profile/you\nhttps://leetcode.com/u/you\nhttps://github.com/you"
            }
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/60 font-mono resize-y min-h-[140px]"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBulkConnect}
              disabled={bulkLoading || !bulkText.trim()}
              className="px-6 py-3 rounded-xl bg-brand-500/90 hover:bg-brand-600 text-sm font-semibold text-white transition-all glow-sm disabled:opacity-40 flex items-center gap-2"
            >
              {bulkLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  Connect all lines
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
            {bulkResult && <span className="text-sm text-emerald-400/90">{bulkResult}</span>}
          </div>
        </motion.div>

        {/* Platform cards with example URLs */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Supported Platforms</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PLATFORM_LIST.map(([key, meta], i) => {
              const linked = connectedByPlatform[key];
              return (
              <motion.div key={key}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`glass glass-hover rounded-xl p-4 border cursor-pointer group transition-all ${
                  detected === key ? "border-brand-500/40 bg-brand-500/5" : ""
                } ${linked ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/5"}`}
                onClick={() => handlePlatformCardClick(key)}>

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{meta.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-white">{meta.name}</h3>
                        {linked && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                            Connected
                          </span>
                        )}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                        meta.tier === "S" ? "text-blue-400"    :
                        meta.tier === "A" ? "text-emerald-400" :
                        meta.tier === "B" ? "text-amber-400"   : "text-slate-400"
                      }`}>{meta.tier}-Tier · {meta.weight}% weight</span>
                    </div>
                  </div>
                  {linked ? (
                    <Pencil className="w-3.5 h-3.5 text-emerald-400/80 group-hover:text-emerald-300 transition-colors" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                  )}
                </div>

                <p className="text-xs text-slate-500 font-mono truncate group-hover:text-slate-400 transition-colors" title={linked?.profileUrl ?? PLATFORM_EXAMPLES[key]}>
                  {(linked?.profileUrl ?? PLATFORM_EXAMPLES[key]).replace(/^https?:\/\//, "")}
                </p>
                <p className="text-xs text-brand-500/60 mt-2 group-hover:text-brand-400 transition-colors">
                  {linked
                    ? "Click to view or edit your URL →"
                    : "Click to use as example →"}
                </p>
              </motion.div>
            );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
