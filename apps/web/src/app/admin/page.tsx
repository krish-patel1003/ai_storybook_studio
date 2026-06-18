"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, BookOpen, ImageIcon, Mic, TrendingUp,
  LogOut, RefreshCw, CheckCircle, Chrome, Shield,
  BarChart2, Clock, Loader2, DollarSign, X,
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
  recent_users: { id: string; email: string; pen_name: string; joined: string; verified: boolean; google: boolean }[];
  recent_books: { title: string; prompt: string; stage: string; style: string; pages: number; created: string }[];
}

interface CostBreakdown {
  llm: number; illustrations: number; audio: number; total: number;
}

interface Costs {
  totals: CostBreakdown;
  by_model: {
    model: string; books: number; illustrated_pages: number; narrated_pages: number;
    llm_cost: number; illustration_cost: number; audio_cost: number; total: number;
  }[];
  avg_per_book: number;
  total_books: number;
}

interface UserSummary {
  id: string; email: string; pen_name: string; joined: string;
  verified: boolean; google: boolean; books: number;
  illustrated_pages: number; narrated_pages: number;
  cost: CostBreakdown;
}

interface UserDetailBook {
  id: string; title: string; prompt: string; model: string;
  page_count: number; art_style: string; age_range: string; stage: string;
  created: string; illustrated: number; narrated: number; cost: CostBreakdown;
}

interface UserDetailData {
  user: { id: string; email: string; pen_name: string; joined: string; verified: boolean; google: boolean; active: boolean };
  books: UserDetailBook[];
  totals: {
    books: number; illustrated_pages: number; narrated_pages: number;
    llm_cost: number; illustration_cost: number; audio_cost: number; total_cost: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function fmtCost(n: number) {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

const STAGE_COLORS: Record<string, string> = {
  complete: "bg-green-500",
  pages: "bg-blue-500",
  outline: "bg-yellow-500",
  characters: "bg-orange-400",
  pending: "bg-muted",
  failed: "bg-destructive",
};

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
        <span className="font-display text-2xl font-black">{value}</span>
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
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background whitespace-nowrap z-10">
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

// ── User detail panel ─────────────────────────────────────────────────────────

function UserDetailPanel({
  userId, creds, onClose,
}: { userId: string; creds: { user: string; pass: string }; onClose: () => void }) {
  const [detail, setDetail] = useState<UserDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = `Basic ${btoa(`${creds.user}:${creds.pass}`)}`;
    fetch(`${API}/admin/users/${userId}`, { headers: { Authorization: auth } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [userId, creds]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-background shadow-2xl border-l-[2.5px] border-foreground overflow-y-auto">
        {/* Panel header */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-background/90 backdrop-blur border-b-[2px] border-foreground px-6 py-4">
          <h2 className="font-display text-xl font-black">User Details</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-muted transition-colors">
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !detail ? (
          <p className="text-center text-muted-foreground p-12">Failed to load user</p>
        ) : (
          <div className="p-6 space-y-6">
            {/* User identity */}
            <div className="flex items-center gap-4 rounded-2xl bg-card p-5 chunky-border">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground chunky-border">
                {detail.user.pen_name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-xl font-black truncate">{detail.user.pen_name}</h3>
                <p className="text-sm text-muted-foreground truncate">{detail.user.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {detail.user.google && (
                    <span className="text-[10px] font-bold rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5">Google</span>
                  )}
                  {detail.user.verified && (
                    <span className="text-[10px] font-bold rounded-full bg-green-100 text-green-700 px-1.5 py-0.5">Verified</span>
                  )}
                  {!detail.user.active && (
                    <span className="text-[10px] font-bold rounded-full bg-red-100 text-red-700 px-1.5 py-0.5">Suspended</span>
                  )}
                  <span className="text-xs text-muted-foreground">Joined {timeAgo(detail.user.joined)}</span>
                </div>
              </div>
            </div>

            {/* Cost summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Books",         value: String(detail.totals.books),                    color: "text-foreground" },
                { label: "LLM Cost",      value: fmtCost(detail.totals.llm_cost),               color: "text-blue-500" },
                { label: "Illustrations", value: fmtCost(detail.totals.illustration_cost),       color: "text-purple-500" },
                { label: "Total Spend",   value: fmtCost(detail.totals.total_cost),              color: "text-primary" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl bg-card p-4 chunky-border text-center">
                  <p className={`font-display text-xl font-black ${color}`}>{value}</p>
                  <p className="text-xs font-bold text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Page stats */}
            <div className="flex gap-3 text-center">
              <div className="flex-1 rounded-2xl bg-muted/50 p-3 chunky-border">
                <p className="font-bold text-purple-500">{detail.totals.illustrated_pages}</p>
                <p className="text-xs text-muted-foreground">Pages illustrated</p>
              </div>
              <div className="flex-1 rounded-2xl bg-muted/50 p-3 chunky-border">
                <p className="font-bold text-pink-500">{detail.totals.narrated_pages}</p>
                <p className="text-xs text-muted-foreground">Pages narrated</p>
              </div>
              <div className="flex-1 rounded-2xl bg-muted/50 p-3 chunky-border">
                <p className="font-bold text-orange-500">{fmtCost(detail.totals.audio_cost)}</p>
                <p className="text-xs text-muted-foreground">Audio cost</p>
              </div>
            </div>

            {/* Books list */}
            <div>
              <h3 className="font-display text-lg font-black mb-3">
                Books <span className="text-muted-foreground font-normal text-sm">({detail.totals.books})</span>
              </h3>
              {detail.books.length === 0 ? (
                <p className="text-sm text-muted-foreground">No books yet</p>
              ) : (
                <div className="space-y-2">
                  {detail.books.map((b) => (
                    <div key={b.id} className="rounded-2xl bg-card p-4 chunky-border">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_COLORS[b.stage] ?? "bg-muted"}`} />
                            <p className="font-bold truncate">{b.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{b.prompt}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-bold text-muted-foreground">
                            <span className="capitalize">{b.art_style}</span>
                            <span>·</span>
                            <span>{b.page_count} pages</span>
                            <span>·</span>
                            <span className="font-mono">{b.model}</span>
                            <span>·</span>
                            <span>{timeAgo(b.created)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-display text-lg font-black text-primary">{fmtCost(b.cost.total)}</p>
                          <p className="text-[10px] text-muted-foreground">{b.illustrated} illus · {b.narrated} audio</p>
                          <p className="text-[10px] text-muted-foreground">LLM {fmtCost(b.cost.llm)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
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
          {err && <p className="text-xs font-bold text-destructive">Invalid credentials</p>}
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
  const [costs, setCosts] = useState<Costs | null>(null);
  const [userList, setUserList] = useState<{ users: UserSummary[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CRED_KEY);
    if (stored) {
      try { setCreds(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  const fetchAll = useCallback(async (u: string, p: string) => {
    setLoading(true);
    const auth = `Basic ${btoa(`${u}:${p}`)}`;
    try {
      const [statsRes, costsRes, usersRes] = await Promise.all([
        fetch(`${API}/admin/stats`,  { headers: { Authorization: auth } }),
        fetch(`${API}/admin/costs`,  { headers: { Authorization: auth } }),
        fetch(`${API}/admin/users`,  { headers: { Authorization: auth } }),
      ]);
      if (!statsRes.ok) { setCreds(null); localStorage.removeItem(CRED_KEY); return; }
      const [statsData, costsData, usersData] = await Promise.all([
        statsRes.json(),
        costsRes.ok  ? costsRes.json()  : null,
        usersRes.ok  ? usersRes.json()  : null,
      ]);
      setStats(statsData);
      if (costsData) setCosts(costsData);
      if (usersData) setUserList(usersData);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (creds) fetchAll(creds.user, creds.pass);
  }, [creds, fetchAll]);

  function handleLogin(u: string, p: string) {
    const c = { user: u, pass: p };
    setCreds(c);
    localStorage.setItem(CRED_KEY, JSON.stringify(c));
  }

  function handleLogout() {
    setCreds(null);
    setStats(null);
    setCosts(null);
    setUserList(null);
    localStorage.removeItem(CRED_KEY);
  }

  if (!creds) return <LoginScreen onLogin={handleLogin} />;

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
              onClick={() => creds && fetchAll(creds.user, creds.pass)}
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
        <div className="mx-auto max-w-7xl px-4 py-8 space-y-10">

          {/* ── Overview stat cards ── */}
          <section>
            <h2 className="font-display text-2xl font-black mb-4">Overview</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard icon={Users}       label="Total Users"        value={stats.users.total}        sub={`+${stats.users.today} today`}   color="bg-blue-500" />
              <StatCard icon={CheckCircle} label="Verified"           value={stats.users.verified}     sub={`${pct(stats.users.verified, stats.users.total)}% of users`} color="bg-green-500" />
              <StatCard icon={Chrome}      label="Google Sign-ups"    value={stats.users.google}       sub={`${pct(stats.users.google, stats.users.total)}% of users`}   color="bg-orange-400" />
              <StatCard icon={BookOpen}    label="Total Books"        value={stats.books.total}        sub={`+${stats.books.today} today`}   color="bg-primary" />
              <StatCard icon={ImageIcon}   label="Pages Illustrated"  value={stats.pages.illustrated}  sub={`${pct(stats.pages.illustrated, stats.pages.total)}% done`}  color="bg-purple-500" />
              <StatCard icon={Mic}         label="Pages Narrated"     value={stats.pages.narrated}     sub={`${pct(stats.pages.narrated, stats.pages.total)}% done`}     color="bg-pink-500" />
            </div>
          </section>

          {/* ── Activity + User growth ── */}
          <div className="grid gap-6 lg:grid-cols-3">
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

            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">User growth</h3>
              <div className="space-y-3">
                {[
                  { label: "Today",        value: stats.users.today },
                  { label: "Last 7 days",  value: stats.users.week },
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
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">Art styles</h3>
              <div className="space-y-3">
                {stats.art_styles.length > 0 ? stats.art_styles.map(({ style, count }) => (
                  <ProgressRow key={style} label={style} value={count} total={stats.books.total} color="bg-purple-500" />
                )) : <p className="text-sm text-muted-foreground">No data yet</p>}
              </div>
            </div>
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">Age ranges</h3>
              <div className="space-y-3">
                {stats.age_ranges.length > 0 ? stats.age_ranges.map(({ range, count }) => (
                  <ProgressRow key={range} label={`Ages ${range}`} value={count} total={stats.books.total} color="bg-orange-400" />
                )) : <p className="text-sm text-muted-foreground">No data yet</p>}
              </div>
            </div>
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">AI models used</h3>
              <div className="space-y-3">
                {stats.models_used.length > 0 ? stats.models_used.map(({ model, count }) => (
                  <ProgressRow key={model} label={model} value={count} total={stats.books.total} color="bg-blue-500" />
                )) : <p className="text-sm text-muted-foreground">No data yet</p>}
              </div>
            </div>
          </div>

          {/* ── Cost analytics ── */}
          {costs && (
            <section>
              <h2 className="font-display text-2xl font-black mb-1">Cost Analytics</h2>
              <p className="text-xs text-muted-foreground mb-4">Estimated — based on per-model pricing and page counts</p>

              {/* Cost overview cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
                <StatCard icon={DollarSign} label="LLM Cost"      value={fmtCost(costs.totals.llm)}           color="bg-blue-500" />
                <StatCard icon={ImageIcon}  label="Illustrations" value={fmtCost(costs.totals.illustrations)} color="bg-purple-500" />
                <StatCard icon={Mic}        label="Audio / TTS"   value={fmtCost(costs.totals.audio)}         color="bg-pink-500" />
                <StatCard icon={BarChart2}  label="Total Spend"   value={fmtCost(costs.totals.total)}         sub={`~${fmtCost(costs.avg_per_book)} / book`} color="bg-green-500" />
              </div>

              {/* Per-model breakdown table */}
              <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm overflow-x-auto">
                <h3 className="font-display text-lg font-black mb-4">Cost breakdown by model</h3>
                {costs.by_model.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No books yet</p>
                ) : (
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground border-b-2 border-foreground/10">
                        <th className="text-left py-2 pr-4">Model</th>
                        <th className="text-right py-2 px-4">Books</th>
                        <th className="text-right py-2 px-4">Illus. pages</th>
                        <th className="text-right py-2 px-4">LLM cost</th>
                        <th className="text-right py-2 px-4">Illustration</th>
                        <th className="text-right py-2 px-4">Audio</th>
                        <th className="text-right py-2 pl-4">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.by_model.map((m) => (
                        <tr key={m.model} className="border-b border-foreground/5 last:border-0">
                          <td className="py-3 pr-4 font-bold font-mono text-xs">{m.model}</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{m.books}</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{m.illustrated_pages}</td>
                          <td className="py-3 px-4 text-right">{fmtCost(m.llm_cost)}</td>
                          <td className="py-3 px-4 text-right">{fmtCost(m.illustration_cost)}</td>
                          <td className="py-3 px-4 text-right">{fmtCost(m.audio_cost)}</td>
                          <td className="py-3 pl-4 text-right font-bold text-primary">{fmtCost(m.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {/* ── Recent activity ── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">Recent sign-ups</h3>
              <div className="space-y-2">
                {stats.recent_users.length > 0 ? stats.recent_users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5 chunky-border">
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
                      <button
                        onClick={() => setSelectedUserId(u.id)}
                        className="rounded-full bg-card border border-foreground/20 px-2 py-0.5 text-[10px] font-bold hover:bg-muted transition-colors ml-1"
                      >
                        View
                      </button>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No users yet</p>}
              </div>
            </div>

            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-4">Recent books</h3>
              <div className="space-y-2">
                {stats.recent_books.length > 0 ? stats.recent_books.map((b, i) => (
                  <div key={i} className="rounded-xl bg-background px-3 py-2.5 chunky-border">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold truncate">{b.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`h-2 w-2 rounded-full ${STAGE_COLORS[b.stage] ?? "bg-muted"}`} />
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

          {/* ── All users ── */}
          {userList && (
            <section>
              <h2 className="font-display text-2xl font-black mb-4">
                All Users <span className="text-muted-foreground font-normal text-lg">({userList.total})</span>
              </h2>
              <div className="rounded-2xl bg-card chunky-border chunky-shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="bg-muted/40 border-b-2 border-foreground/10">
                      <tr className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        <th className="text-left px-5 py-3">User</th>
                        <th className="text-right px-5 py-3">Books</th>
                        <th className="text-right px-5 py-3">Illustrated</th>
                        <th className="text-right px-5 py-3">Narrated</th>
                        <th className="text-right px-5 py-3">Est. Spend</th>
                        <th className="text-right px-5 py-3">Joined</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {userList.users.map((u) => (
                        <tr key={u.id} className="border-t border-foreground/5 hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                                {u.pen_name.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold truncate">{u.pen_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                              </div>
                              {u.google && <span className="text-[10px] font-bold rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5 shrink-0">G</span>}
                              {u.verified && <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" strokeWidth={2.5} />}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-bold">{u.books}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{u.illustrated_pages}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{u.narrated_pages}</td>
                          <td className="px-5 py-3 text-right font-bold text-primary">{fmtCost(u.cost.total)}</td>
                          <td className="px-5 py-3 text-right text-xs text-muted-foreground">{timeAgo(u.joined)}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => setSelectedUserId(u.id)}
                              className="rounded-full bg-background px-3 py-1 text-xs font-bold chunky-border hover:-translate-y-0.5 transition-transform"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                      {userList.users.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">No users yet</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

        </div>
      )}

      {/* User detail slide-over */}
      {selectedUserId && creds && (
        <UserDetailPanel
          userId={selectedUserId}
          creds={creds}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </main>
  );
}
