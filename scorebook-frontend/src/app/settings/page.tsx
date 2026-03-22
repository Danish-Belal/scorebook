"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Save, ArrowLeft, Globe, Lock, User as UserIcon } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { authApi, usersApi, User, ApiError } from "@/lib/api";
import { toast } from "sonner";

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [profileSlug, setProfileSlug] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getMe()
      .then((r) => {
        if (cancelled) return;
        setUser(r.user);
        setDisplayName(r.user.displayName ?? "");
        setBio(r.user.bio ?? "");
        setIsPublic(r.user.isPublic !== false);
        setProfileSlug(r.user.profileSlug ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) router.push("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const slugTrim = profileSlug.trim();
      const { user: updated } = await usersApi.updateMe({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        isPublic,
        profileSlug: slugTrim === "" ? null : slugTrim,
      });
      setUser(updated);
      setProfileSlug(updated.profileSlug ?? "");
      toast.success("Settings saved");
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const previewOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const previewSlug = profileSlug.trim().toLowerCase().replace(/\s+/g, "-");
  const previewPath =
    previewSlug.length >= 3 ? `/u/${previewSlug}` : user?.id ? `/u/${user.id}` : "/u/…";

  if (loading) {
    return (
      <div className="min-h-screen mesh-bg">
        <Navbar />
        <div className="pt-28 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
          <p className="text-sm text-slate-400">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen mesh-bg">
      <Navbar />
      <div className="pt-20 pb-16 max-w-xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <UserIcon className="w-7 h-7 text-brand-400" />
            Account settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Profile, public visibility, and shareable URL.</p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 border border-white/8 space-y-6"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Short intro (optional)"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y min-h-[100px]"
            />
          </div>

          <div className="flex items-start justify-between gap-4 pt-2 border-t border-white/5">
            <div>
              <p className="text-sm font-medium text-white flex items-center gap-2">
                {isPublic ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
                Public profile
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                When off, your score page returns “not found” for everyone except you. You can still use ScoreBook while
                signed in.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic((v) => !v)}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                isPublic ? "bg-brand-500" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  isPublic ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="pt-2 border-t border-white/5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Profile URL slug
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Optional short link (e.g. <span className="text-slate-400 font-mono">jane-doe</span>). Letters, numbers,
              hyphens only; 3–32 characters. Leave empty to use only your UUID link.
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
              <span className="text-slate-500 text-sm shrink-0">/u/</span>
              <input
                type="text"
                value={profileSlug}
                onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                maxLength={32}
                placeholder="your-handle"
                className="flex-1 min-w-0 bg-transparent text-white text-sm focus:outline-none placeholder:text-slate-600"
              />
            </div>
            <p className="text-xs text-slate-600 mt-2 font-mono break-all">
              Preview: {previewOrigin}
              {previewPath}
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
        </motion.section>
      </div>
    </div>
  );
}
