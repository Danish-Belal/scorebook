"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import AuthShell, { authFieldClass } from "@/components/auth/AuthShell";
import { authApi } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.login({ email: email.trim(), password });
      try {
        sessionStorage.setItem("scorebook_auto_sync_v1", "1");
      } catch {
        /* ignore */
      }
      toast.success("Signed in — refreshing your platform data in the background");
      router.push(nextPath.startsWith("/") ? nextPath : "/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with email or a provider below"
      footer={
        <>
          No account?{" "}
          <Link href="/signup" className="text-brand-400 hover:text-brand-300 font-medium">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen mesh-bg flex items-center justify-center text-slate-500">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
