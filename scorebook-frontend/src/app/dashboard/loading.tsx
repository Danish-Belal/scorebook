"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trophy } from "lucide-react";

export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.push("/dashboard"); }, []);
  return (
    <div className="min-h-screen mesh-bg flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center glow-brand">
        <Trophy className="w-6 h-6 text-white" />
      </div>
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Taking you to your dashboard...</span>
      </div>
    </div>
  );
}
