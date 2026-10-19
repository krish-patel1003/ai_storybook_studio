"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Shield, RefreshCw, ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Gauge, Activity, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
const CRED_KEY = "sb_admin_creds";

type Rating = "pass" | "warn" | "fail";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function ratingStyle(r: Rating) {
  if (r === "pass") return { Icon: CheckCircle2, cls: "bg-green-100 text-green-800 border-green-700", label: "PASS" };
  if (r === "warn") return { Icon: AlertTriangle, cls: "bg-amber-100 text-amber-800 border-amber-700", label: "WARN" };
  return { Icon: XCircle, cls: "bg-red-100 text-red-800 border-red-700", label: "FAIL" };
}

export default function TestResultsPage() {
  const [creds, setCreds] = useState<{ user: string; pass: string } | null>(null);
  const [runs, setRuns] = useState<Json[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CRED_KEY);
      if (raw) setCreds(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const fetchRuns = useCallback(async (u: string, p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/test-results?limit=10`, {
        headers: { Authorization: `Basic ${btoa(`${u}:${p}`)}` },
      });
      if (res.status === 401) { setCreds(null); localStorage.removeItem(CRED_KEY); setError("Invalid admin credentials."); return; }
      if (!res.ok) { setError(`Failed to load (${res.status}).`); return; }
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (creds) fetchRuns(creds.user, creds.pass); }, [creds, fetchRuns]);

  if (!creds) return <LoginScreen onLogin={(u, p) => { const c = { user: u, pass: p }; localStorage.setItem(CRED_KEY, JSON.stringify(c)); setCreds(c); }} error={error} />;

  const latest = runs?.[0];
  const summary: Json = latest?.summary;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">
            <ArrowLeft className="h-4 w-4" strokeWidth={3} /> Admin
          </Link>
          <h1 className="font-display text-2xl font-black md:text-3xl">Load & resilience tests</h1>
        </div>
        <button onClick={() => creds && fetchRuns(creds.user, creds.pass)} disabled={loading}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={2.5} /> Refresh
        </button>
      </div>

      {error && <p className="mb-4 text-sm font-bold text-destructive">{error}</p>}

      {!summary ? (
        <div className="rounded-3xl bg-card p-10 text-center chunky-border">
          <p className="font-bold text-muted-foreground">No test runs yet. Run <code className="font-mono">scripts/loadtest.py</code> to populate this.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Meta */}
          <div className="rounded-2xl bg-card p-4 chunky-border text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span><span className="font-bold">Ran:</span> {latest?.created_at ? new Date(latest.created_at).toLocaleString() : "—"}</span>
              <span className="truncate"><span className="font-bold">Target:</span> {summary.target}</span>
              <span><span className="font-bold">Authed:</span> {summary.authed ? "yes" : "no"}</span>
            </div>
            {summary.notes && <p className="mt-2 text-xs text-muted-foreground">{summary.notes}</p>}
          </div>

          {/* Verdict cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              ["scalability", Gauge],
              ["reliability", Activity],
              ["resilience", ShieldCheck],
            ] as const).map(([key, Icon]) => {
              const v = summary.verdict?.[key];
              if (!v) return null;
              const st = ratingStyle(v.rating as Rating);
              return (
                <div key={key} className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-display text-lg font-black capitalize"><Icon className="h-5 w-5" strokeWidth={2.5} /> {key}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-0.5 text-xs font-extrabold ${st.cls}`}>
                      <st.Icon className="h-3.5 w-3.5" strokeWidth={3} /> {st.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{v.note}</p>
                </div>
              );
            })}
          </div>

          {/* Scalability ramp */}
          {summary.scenarios?.scalability_ramp && (
            <Section title="Scalability — concurrency ramp" desc={summary.scenarios.scalability_ramp.endpoint}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Concurrency</th><th className="px-3 py-2">RPS</th>
                      <th className="px-3 py-2">p50</th><th className="px-3 py-2">p95</th>
                      <th className="px-3 py-2">p99</th><th className="px-3 py-2">Success</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.scenarios.scalability_ramp.levels).map(([c, l]: [string, Json]) => (
                      <tr key={c} className="border-t-2 border-foreground/10">
                        <td className="px-3 py-2 font-extrabold">{c}</td>
                        <td className="px-3 py-2">{l.rps}</td>
                        <td className="px-3 py-2">{l.latency_ms.p50}ms</td>
                        <td className="px-3 py-2 font-bold">{l.latency_ms.p95}ms</td>
                        <td className="px-3 py-2">{l.latency_ms.p99}ms</td>
                        <td className="px-3 py-2">{(l.success_rate * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Reliability + Resilience + baseline */}
          <div className="grid gap-4 md:grid-cols-2">
            {summary.scenarios?.reliability_sustained && (
              <Section title="Reliability — sustained load">
                <Stat label="Success rate" value={`${(summary.scenarios.reliability_sustained.success_rate * 100).toFixed(2)}%`} />
                <Stat label="Requests" value={summary.scenarios.reliability_sustained.requests} />
                <Stat label="Connection errors" value={summary.scenarios.reliability_sustained.connection_errors} />
                <Stat label="p95 latency" value={`${summary.scenarios.reliability_sustained.latency_ms.p95}ms`} />
                <p className="mt-2 text-xs text-muted-foreground">{summary.scenarios.reliability_sustained.description}</p>
              </Section>
            )}
            {summary.scenarios?.resilience_spike && (
              <Section title="Resilience — spike & recovery">
                <Stat label="Spike success" value={`${(summary.scenarios.resilience_spike.spike.success_rate * 100).toFixed(1)}%`} />
                <Stat label="Spike p95" value={`${summary.scenarios.resilience_spike.spike.latency_ms.p95}ms`} />
                <Stat label="Recovery latency" value={`${summary.scenarios.resilience_spike.recovery_mean_ms}ms`} />
                <Stat label="Recovered" value={summary.scenarios.resilience_spike.recovered ? "yes" : "no"} />
                <p className="mt-2 text-xs text-muted-foreground">{summary.scenarios.resilience_spike.description}</p>
              </Section>
            )}
          </div>

          {/* Input validation */}
          {summary.scenarios?.input_validation && (
            <Section title="Input validation — graceful errors" desc={summary.scenarios.input_validation.description}>
              <ul className="space-y-1.5 text-sm">
                {summary.scenarios.input_validation.checks.map((c: Json, i: number) => (
                  <li key={i} className="flex items-center justify-between gap-3 border-t-2 border-foreground/10 pt-1.5 first:border-0 first:pt-0">
                    <span className="font-mono text-xs">{c.check}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-xs font-extrabold ${c.graceful_4xx ? "bg-green-100 text-green-800 border-green-700" : "bg-red-100 text-red-800 border-red-700"}`}>
                      {c.status ?? "ERR"}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Baseline + auth */}
          <div className="grid gap-4 md:grid-cols-2">
            {summary.scenarios?.baseline && (
              <Section title="Baseline latency">
                <Stat label="Cold first hit" value={`${summary.scenarios.baseline.cold_first_ms}ms`} />
                <Stat label="Warm mean" value={`${summary.scenarios.baseline.warm_mean_ms}ms`} />
              </Section>
            )}
            {summary.scenarios?.auth_throughput && (
              <Section title="Auth throughput (bcrypt)">
                <Stat label="RPS" value={summary.scenarios.auth_throughput.rps} />
                <Stat label="p95 latency" value={`${summary.scenarios.auth_throughput.latency_ms.p95}ms`} />
                <Stat label="Success" value={`${(summary.scenarios.auth_throughput.success_rate * 100).toFixed(1)}%`} />
              </Section>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-5 chunky-border">
      <h2 className="font-display text-lg font-black">{title}</h2>
      {desc && <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t-2 border-foreground/10 py-1.5 text-sm first:border-0 first:pt-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-extrabold">{value}</span>
    </div>
  );
}

function LoginScreen({ onLogin, error }: { onLogin: (u: string, p: string) => void; error: string | null }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(false);
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/test-results?limit=1`, { headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` } });
      if (res.ok) onLogin(user, pass); else setErr(true);
    } catch { setErr(true); } finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-primary-foreground chunky-border">
            <Shield className="h-3.5 w-3.5" strokeWidth={3} /> Admin
          </span>
          <h1 className="mt-4 font-display text-3xl font-black">Test results</h1>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl bg-card p-8 chunky-border chunky-shadow">
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Username"
            className="w-full rounded-xl bg-background px-4 py-3 font-semibold chunky-border outline-none focus:ring-4 focus:ring-primary/20" />
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password"
            className="w-full rounded-xl bg-background px-4 py-3 font-semibold chunky-border outline-none focus:ring-4 focus:ring-primary/20" />
          {(err || error) && <p className="text-xs font-bold text-destructive">{error || "Invalid credentials"}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-2xl bg-primary py-3 font-extrabold text-primary-foreground chunky-border chunky-shadow-sm disabled:opacity-60">
            {loading ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
