"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Trophy, LayoutDashboard, Users, Plus, LogOut, Menu, X, ChevronDown } from "lucide-react";
import { authApi, usersApi, User } from "@/lib/api";
import { toast } from "sonner";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    authApi.getMe()
      .then(r => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    toast.success("Signed out");
    router.push("/");
  };

  const navItems = [
    { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
    { href: "/leaderboard", label: "Leaderboard", icon: Users },
    { href: "/connect",     label: "Add Platform",icon: Plus },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center glow-sm group-hover:scale-105 transition-transform">
            <Trophy className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">ScoreBook</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                pathname === href
                  ? "bg-brand-500/15 text-brand-400 border border-brand-500/25"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* User menu */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="w-8 h-8 rounded-full skeleton" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg glass border border-white/8 cursor-pointer hover:border-white/15 transition-all"
                onClick={() => router.push("/dashboard")}>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-brand-500/30 flex items-center justify-center text-xs font-bold text-brand-400">
                    {user.displayName[0]}
                  </div>
                )}
                <span className="text-sm font-medium text-slate-200">{user.displayName}</span>
              </div>
              <button onClick={handleLogout}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/auth/github`}
               className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 hover:bg-brand-600 transition-all glow-sm text-white">
              Sign in
            </a>
          )}

          {/* Mobile menu */}
          <button className="md:hidden p-2 text-slate-400" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden glass border-t border-white/5 px-4 py-3 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                pathname === href ? "bg-brand-500/15 text-brand-400" : "text-slate-400"
              }`}>
              <Icon className="w-4 h-4" />{label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
