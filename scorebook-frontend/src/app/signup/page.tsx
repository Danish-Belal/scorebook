"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import AuthShell, { authFieldClass } from "@/components/auth/AuthShell";
import { authApi } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await authApi.register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
      toast.success("Account created — add your platform profiles next");
      router.push("/connect?welcome=1");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not create account";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Then add all your coding platform profile URLs on the next step"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium">
            Sign in
          </Link>
        </>
      }
    >
      <div className="mb-6 flex items-start gap-2 rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3 text-xs text-slate-400">
        <Link2 className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
        <p>
          After sign-up you&apos;ll go to <strong className="text-slate-300">Connect platforms</strong> where you can paste
          multiple profile links (one per line or one at a time).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 block">Display name</label>
          <input
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Alex Developer"
            className={authFieldClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 block">Email</label>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={authFieldClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 block">Password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className={authFieldClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 block">Confirm password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
            className={authFieldClass}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white transition-all glow-sm disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating account…
            </>
          ) : (
            "Create account & connect platforms"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
