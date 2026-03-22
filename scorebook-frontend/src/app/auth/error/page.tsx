"use client";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { authApi } from "@/lib/api";

export default function AuthError() {
  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Authentication failed</h1>
        <p className="text-slate-400 mb-8">
          Something went wrong during sign in. This can happen if you denied access or there was a network issue.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href={authApi.githubUrl()}
            className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white transition-all glow-sm">
            Try again with GitHub
          </a>
          <Link href="/"
            className="px-6 py-3 rounded-xl glass glass-hover border border-white/8 text-sm font-medium text-slate-300 hover:text-white transition-all flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
