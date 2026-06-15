"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, BookOpen, ImageIcon, Mic, TrendingUp,
  LogOut, RefreshCw, CheckCircle, Chrome, Shield,
  BarChart2, Clock, Loader2,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
const CRED_KEY = "sb_admin_creds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  users: { total: number; verified: number; google: number; today: number; week: number; month: number };
  books: { total: number; complete: number; today: number; week: number; month: number };
  pages: { total: number; illustrated: number; narrated: number };
  art_styles: { style: string; count: number }[];
  age_ranges: { range: string; count: number }[];
  models_used: { model: string; count: number }[];
  books_per_day: { day: string; count: number }[];
  recent_users: { email: string; pen_name: string; joined: string; verified: boolean; google: boolean }[];
  recent_books: { title: string; prompt: string; stage: string; style: string; pages: number; created: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color = "bg-primary",
}: {
  icon: React.ElementType; label: string; value: number | string;
  sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${color} chunky-border`}>
          <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
        </span>
        <span className="font-display text-3xl font-black">{value}</span>
      </div>
      <p className="mt-3 text-sm font-extrabold">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function MiniBar({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-1 group relative">
          <div
            className="w-full rounded-t bg-primary transition-all"
            style={{ height: `${(d.count / max) * 56}px`, minHeight: d.count > 0 ? 4 : 0 }}
          />
          {/* Tooltip */}
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block
                           rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background whitespace-nowrap z-10">
            {d.day}: {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Progress row ──────────────────────────────────────────────────────────────

function ProgressRow({ label, value, total, color = "bg-primary" }: {
  label: string; value: number; total: number; color?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm font-bold mb-1">
        <span>{label}</span>
        <span>{value} <span className="text-muted-foreground font-normal">({pct(value, total)}%)</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct(value, total)}%` }} />
      </div>
    </div>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (u: string, p: string) => void }) {
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("admin");
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(false);
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/stats`, {
        headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` },
      });
      if (res.ok) {
        onLogin(user, pass);
      } else {
        setErr(true);
      }
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-primary-foreground chunky-border">
            <Shield className="h-3.5 w-3.5" strokeWidth={3} /> Admin
          </span>
          <h1 className="mt-4 font-display text-4xl font-black">Dashboard</h1>
          <p className="mt-1 text-muted-foreground text-sm">Storybook.Studio internal</p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-3xl bg-card p-8 chunky-border chunky-shadow space-y-4">
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Username</label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-background px-4 py-3 font-semibold chunky-border outline-none focus:ring-4 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Password</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-background px-4 py-3 font-semibold chunky-border outline-none focus:ring-4 focus:ring-primary/20"
            />
          </div>
          {err && (
            <p className="text-xs font-bold text-destructive">Invalid credentials</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-extrabold text-primary-foreground chunky-border chunky-shadow-sm disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
            {loading ? "Signing in…" : "Sign in to dashboard"}
          </button>
        </form>
      </div>
    </main>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [creds, setCreds] = useState<{ user: string; pass: string } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Restore session
  useEffect(() => {
    const stored = localStorage.getItem(CRED_KEY);
    if (stored) {
      try { setCreds(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  const fetchStats = useCallback(async (u: string, p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/stats`, {
        headers: { Authorization: `Basic ${btoa(`${u}:${p}`)}` },
      });
      if (!res.ok) { setCreds(null); localStorage.removeItem(CRED_KEY); return; }
      setStats(await res.json());
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (creds) fetchStats(creds.user, creds.pass);
  }, [creds, fetchStats]);

  function handleLogin(u: string, p: string) {
    const c = { user: u, pass: p };
    setCreds(c);
    localStorage.setItem(CRED_KEY, JSON.stringify(c));
  }

  function handleLogout() {
    setCreds(null);
    setStats(null);
    localStorage.removeItem(CRED_KEY);
  }

  if (!creds) return <LoginScreen onLogin={handleLogin} />;

  const stageColors: Record<string, string> = {
    complete: "bg-green-500",
    pages: "bg-blue-500",
    outline: "bg-yellow-500",
    characters: "bg-orange-400",
    pending: "bg-muted",
    failed: "bg-destructive",
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b-[2.5px] border-foreground bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary chunky-border">
              <BarChart2 className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </span>
            <span className="font-display text-lg font-black">
              Storybook<span className="text-primary">.</span>Studio Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                Updated {timeAgo(lastRefresh.toISOString())}
              </span>
            )}
            <button
              onClick={() => creds && fetchStats(creds.user, creds.pass)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2.5} />
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold text-destructive chunky-border hover:-translate-y-0.5 transition-transform"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2.5} /> Sign out
            </button>
          </div>
        </div>
      </header>

      {!stats || loading ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">

          {/* ── Stat cards ── */}
          <section>
            <h2 className="font-display text-2xl font-black mb-4">Overview</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard icon={Users}    label="Total Users"      value={stats.users.total}       sub={`+${stats.users.today} today`}  color="bg-blue-500" />
              <StatCard icon={CheckCircle} label="Verified"      value={stats.users.verified}    sub={`${pct(stats.users.verified, stats.users.total)}% of users`} color="bg-green-500" />
              <StatCard icon={Chrome}   label="Google Sign-ups"  value={stats.users.google}      sub={`${pct(stats.users.google, stats.users.total)}% of users`}  color="bg-orange-400" />
              <StatCard icon={BookOpen} label="Total Books"       value={stats.books.total}       sub={`+${stats.books.today} today`}  color="bg-primary" />
              <StatCard icon={ImageIcon} label="Pages Illustrated" value={stats.pages.illustrated} sub={`${pct(stats.pages.illustrated, stats.pages.total)}% done`} color="bg-purple-500" />
              <StatCard icon={Mic}      label="Pages Narrated"   value={stats.pages.narrated}    sub={`${pct(stats.pages.narrated, stats.pages.total)}% done`}  color="bg-pink-500" />
            </div>
          </section>

          {/* ── Activity + Breakdowns ── */}
          <div className="grid gap-6 lg:grid-cols-3">

            {/* Books per day chart */}
            <div className="lg:col-span-2 rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-black">Books created (last 14 days)</h3>
                <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={2.5} />
              </div>
              {stats.books_per_day.length > 0 ? (
                <>
                  <MiniBar data={stats.books_per_day} />
                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground font-bold overflow-hidden">
                    {stats.books_per_day.map((d) => (
                      <span key={d.day} className="flex-1 text-center truncate">{d.day.split(" ")[1]}</span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No books yet in this period</p>
              )}
            </div>

            {/* User growth */}
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">User growth</h3>
              <div className="space-y-3">
                {[
                  { label: "Today",      value: stats.users.today },
                  { label: "Last 7 days", value: stats.users.week },
                  { label: "Last 30 days", value: stats.users.month },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between rounded-xl bg-background px-3 py-2 chunky-border">
                    <span className="text-sm font-bold">{label}</span>
                    <span className="font-display text-lg font-black text-primary">+{value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2 chunky-border">
                  <span className="text-sm font-bold">All time</span>
                  <span className="font-display text-lg font-black">{stats.users.total}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Breakdowns ── */}
          <div className="grid gap-6 md:grid-cols-3">

            {/* Art styles */}
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">Art styles</h3>
              <div className="space-y-3">
                {stats.art_styles.length > 0 ? stats.art_styles.map(({ style, count }) => (
                  <ProgressRow key={style} label={style} value={count} total={stats.books.total} color="bg-purple-500" />
                )) : <p className="text-sm text-muted-foreground">No data yet</p>}
              </div>
            </div>

            {/* Age ranges */}
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">Age ranges</h3>
              <div className="space-y-3">
                {stats.age_ranges.length > 0 ? stats.age_ranges.map(({ range, count }) => (
                  <ProgressRow key={range} label={`Ages ${range}`} value={count} total={stats.books.total} color="bg-orange-400" />
                )) : <p className="text-sm text-muted-foreground">No data yet</p>}
              </div>
            </div>

            {/* AI models */}
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">AI models used</h3>
              <div className="space-y-3">
                {stats.models_used.length > 0 ? stats.models_used.map(({ model, count }) => (
                  <ProgressRow key={model} label={model} value={count} total={stats.books.total} color="bg-blue-500" />
                )) : <p className="text-sm text-muted-foreground">No data yet</p>}
              </div>
            </div>
          </div>

          {/* ── Recent activity ── */}
          <div className="grid gap-6 lg:grid-cols-2">

            {/* Recent signups */}
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">Recent sign-ups</h3>
              <div className="space-y-2">
                {stats.recent_users.length > 0 ? stats.recent_users.map((u, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5 chunky-border">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                      {u.pen_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{u.pen_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {u.google && <span title="Google" className="text-[10px] font-bold rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5">G</span>}
                      {u.verified && <CheckCircle className="h-3.5 w-3.5 text-green-500" strokeWidth={2.5} />}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-3 w-3" strokeWidth={2} />{timeAgo(u.joined)}
                      </span>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No users yet</p>}
              </div>
            </div>

            {/* Recent books */}
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">Recent books</h3>
              <div className="space-y-2">
                {stats.recent_books.length > 0 ? stats.recent_books.map((b, i) => (
                  <div key={i} className="rounded-xl bg-background px-3 py-2.5 chunky-border">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold truncate">{b.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`h-2 w-2 rounded-full ${stageColors[b.stage] ?? "bg-muted"}`} />
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-3 w-3" strokeWidth={2} />{timeAgo(b.created)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{b.prompt}</p>
                    <div className="mt-1 flex gap-2 text-[10px] font-bold text-muted-foreground">
                      <span className="capitalize">{b.style}</span>
                      <span>·</span>
                      <span>{b.pages} pages</span>
                      <span>·</span>
                      <span className="capitalize">{b.stage}</span>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No books yet</p>}
              </div>
            </div>
          </div>

        </div>
      )}
    </main>
  );
}
