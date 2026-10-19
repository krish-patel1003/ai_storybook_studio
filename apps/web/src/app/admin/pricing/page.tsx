"use client";

import { ArrowLeft, DollarSign, BookOpen, ImageIcon, Mic, Users, TrendingUp, CheckCircle, Layers } from "lucide-react";
import Link from "next/link";

// ── Static data ───────────────────────────────────────────────────────────────

const COSTS = {
  avg_per_book: 1.16,
  llm_per_book: 0.30,
  illustration_per_page: 0.07,
  narration_per_char: 0.000050,
  narration_per_page: 0.10,
  fixed_infra_monthly: 57,
  sample_books: 31,
};

const TIERS = [
  {
    name: "Free",
    price: 0,
    color: "bg-slate-500",
    accent: "border-slate-400",
    textAccent: "text-slate-600",
    books_per_month: 3,
    page_pool: 24,
    hard_max_per_book: 8,
    ai_models: ["gemini-3.5-flash"],
    art_styles: 3,
    voice_options: 1,
    illustrations: true,
    narration: false,
    avatars: false,
    priority_queue: false,
    features: [
      "3 books per month",
      "24-page monthly pool",
      "Max 8 pages per book",
      "3 art styles",
      "Gemini Flash model",
      "Watermark-free downloads",
    ],
    cogs_at_avg: 3.48,
    margin_pct: null,
    positioning: "Acquisition & trial",
  },
  {
    name: "Starter",
    price: 9.99,
    color: "bg-blue-500",
    accent: "border-blue-400",
    textAccent: "text-blue-600",
    books_per_month: 10,
    page_pool: 100,
    hard_max_per_book: 15,
    ai_models: ["gemini-3.5-flash", "gemini-3.1-pro-preview"],
    art_styles: 8,
    voice_options: 3,
    illustrations: true,
    narration: true,
    avatars: false,
    priority_queue: false,
    features: [
      "10 books per month",
      "100-page monthly pool",
      "Max 15 pages per book",
      "All 8 art styles",
      "Pro AI model access",
      "AI narration (3 voices)",
      "PDF + digital export",
    ],
    cogs_at_avg: 4.38,
    margin_pct: 56,
    positioning: "Individual parents & educators",
  },
  {
    name: "Family",
    price: 17.99,
    color: "bg-purple-500",
    accent: "border-purple-400",
    textAccent: "text-purple-600",
    books_per_month: 20,
    page_pool: 250,
    hard_max_per_book: 25,
    ai_models: ["gemini-3.5-flash", "gemini-3.1-pro-preview"],
    art_styles: 8,
    voice_options: 5,
    illustrations: true,
    narration: true,
    avatars: true,
    priority_queue: false,
    features: [
      "20 books per month",
      "250-page monthly pool",
      "Max 25 pages per book",
      "All art styles",
      "AI avatar generator",
      "All 5 narrator voices",
      "Family library (up to 5 profiles)",
      "Priority generation queue",
    ],
    cogs_at_avg: 6.84,
    margin_pct: 62,
    positioning: "Families & schools",
    recommended: true,
  },
  {
    name: "Creator",
    price: 34.99,
    color: "bg-amber-500",
    accent: "border-amber-400",
    textAccent: "text-amber-600",
    books_per_month: Infinity,
    page_pool: 600,
    hard_max_per_book: 40,
    ai_models: ["gemini-3.5-flash", "gemini-3.1-pro-preview"],
    art_styles: 8,
    voice_options: 5,
    illustrations: true,
    narration: true,
    avatars: true,
    priority_queue: true,
    features: [
      "Unlimited books",
      "600-page monthly pool",
      "Max 40 pages per book",
      "Fastest generation queue",
      "All premium features",
      "API access (beta)",
      "Commercial use license",
      "Early feature access",
    ],
    cogs_at_avg: 11.16,
    margin_pct: 68,
    positioning: "Content creators & publishers",
  },
];

const PROJECTIONS = [
  { users: 100, free_pct: 70, starter_pct: 20, family_pct: 7, creator_pct: 3 },
  { users: 500, free_pct: 65, starter_pct: 22, family_pct: 9, creator_pct: 4 },
  { users: 1000, free_pct: 60, starter_pct: 25, family_pct: 11, creator_pct: 4 },
  { users: 5000, free_pct: 55, starter_pct: 28, family_pct: 13, creator_pct: 4 },
];

function calcRevenue(row: typeof PROJECTIONS[0]) {
  const u = row.users;
  const starter = (row.starter_pct / 100) * u * 9.99;
  const family  = (row.family_pct / 100)  * u * 17.99;
  const creator = (row.creator_pct / 100) * u * 34.99;
  const mrr = starter + family + creator;

  const free_cogs    = (row.free_pct / 100)    * u * 3.48;
  const starter_cogs = (row.starter_pct / 100) * u * 4.38;
  const family_cogs  = (row.family_pct / 100)  * u * 6.84;
  const creator_cogs = (row.creator_pct / 100) * u * 11.16;
  const total_cogs = free_cogs + starter_cogs + family_cogs + creator_cogs;

  const gross_profit = mrr - total_cogs - COSTS.fixed_infra_monthly;
  const margin_pct = mrr > 0 ? Math.round((gross_profit / mrr) * 100) : -100;
  return { mrr: Math.round(mrr), total_cogs: Math.round(total_cogs), gross_profit: Math.round(gross_profit), margin_pct };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtCost(n: number) {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

// ── Components ────────────────────────────────────────────────────────────────

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-2xl font-black">{children}</h2>
      {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function CostRow({ label, value, sub, color = "text-foreground" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-foreground/5 last:border-0">
      <div>
        <p className="text-sm font-bold">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <p className={`font-display text-lg font-black ${color}`}>{value}</p>
    </div>
  );
}

function Check({ yes }: { yes: boolean }) {
  return yes
    ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" strokeWidth={2.5} />
    : <span className="h-4 w-4 shrink-0 text-muted-foreground text-xs flex items-center">—</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PricingAnalysis() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b-[2.5px] border-foreground bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold chunky-border hover:-translate-y-0.5 transition-transform"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
              Back to Dashboard
            </Link>
            <span className="hidden sm:block font-display text-lg font-black">
              Olivian<span className="text-primary">X</span> <span className="text-muted-foreground font-normal">/ Pricing Analysis</span>
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Updated July 2026</span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-10 space-y-16">

        {/* ── Production cost baseline ── */}
        <section>
          <SectionTitle sub="Real costs measured from production data — 31 books generated">
            Production Cost Baseline
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: BookOpen,   label: "Avg cost / book",       value: fmtCost(COSTS.avg_per_book),           sub: "all-in including LLM + images + TTS",       color: "bg-primary" },
              { icon: DollarSign, label: "LLM cost / book",        value: fmtCost(COSTS.llm_per_book),           sub: "story generation, outline, characters",     color: "bg-blue-500" },
              { icon: ImageIcon,  label: "Illustration / page",    value: fmtCost(COSTS.illustration_per_page),  sub: "gemini-3-pro-image per page",               color: "bg-purple-500" },
              { icon: Mic,        label: "Narration / page",       value: fmtCost(COSTS.narration_per_page),     sub: "Gemini TTS, ~1,500 chars avg per page",     color: "bg-pink-500" },
            ].map(({ icon: Icon, label, value, sub, color }) => (
              <div key={label} className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
                <div className="flex items-start justify-between">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${color} chunky-border`}>
                    <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
                  </span>
                  <span className="font-display text-2xl font-black">{value}</span>
                </div>
                <p className="mt-3 text-sm font-extrabold">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-3">Fixed monthly infrastructure</h3>
              <CostRow label="Cloud Run (API)"     value="~$18/mo"  sub="scales to $0 when idle, spikes on traffic" />
              <CostRow label="Cloud SQL (Postgres)" value="~$15/mo" sub="db-f1-micro, us-central1" />
              <CostRow label="Cloud Storage / GCS"  value="~$4/mo"  sub="generated images, audio files" />
              <CostRow label="Vercel (Frontend)"    value="~$0/mo"  sub="Pro plan, hobby tier currently" />
              <CostRow label="MinIO / object store" value="~$5/mo"  sub="book assets, covers" />
              <CostRow label="Other (DNS, TLS, CDN)"value="~$15/mo" sub="Cloudflare, misc" />
              <div className="mt-3 flex justify-between pt-3 border-t-2 border-foreground/10">
                <p className="font-bold">Total fixed infra</p>
                <p className="font-display text-xl font-black text-primary">~$57/mo</p>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
              <h3 className="font-display text-lg font-black mb-3">Variable COGS model</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Cost per user depends on actual usage — not per-book quotas. Formula:
              </p>
              <div className="space-y-2 font-mono text-xs bg-muted/40 rounded-xl p-4">
                <p className="font-bold text-blue-600">COGS_per_user =</p>
                <p className="pl-4 text-muted-foreground">books × $0.30 (LLM)</p>
                <p className="pl-4 text-muted-foreground">+ pages_illus × $0.07</p>
                <p className="pl-4 text-muted-foreground">+ pages_narr × $0.10</p>
                <p className="pl-4 text-muted-foreground">+ ($57 / total_users)</p>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                At 31 books for 1 user: $1.16/book avg includes partial illustration/narration.
                Full illustration + narration on a 10-page book ≈ $2.00.
              </p>
            </div>
          </div>
        </section>

        {/* ── Page pool model ── */}
        <section>
          <SectionTitle sub="Monthly page pool instead of per-book hard limits — unused pages carry across books">
            Page Pool Model
          </SectionTitle>
          <div className="rounded-2xl bg-card p-6 chunky-border chunky-shadow-sm">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-bold text-base mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-500" strokeWidth={2.5} />
                  How it works
                </h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex gap-3">
                    <span className="font-display text-xl font-black text-primary shrink-0">1</span>
                    <p>Each user gets a <strong className="text-foreground">monthly page pool</strong> — a budget of pages refreshed on billing date.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-display text-xl font-black text-primary shrink-0">2</span>
                    <p>When creating a book, pages come from this pool. A 5-page book uses 5 pages; unused pages from short books can fund longer ones.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-display text-xl font-black text-primary shrink-0">3</span>
                    <p>A <strong className="text-foreground">hard per-book maximum</strong> prevents single-book abuse (e.g., a 200-page book draining the whole pool).</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-display text-xl font-black text-primary shrink-0">4</span>
                    <p>Regeneration of individual pages still draws from the pool — encourages thoughtful use, not infinite retries.</p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-base mb-3">Example (Starter tier: 100-page pool)</h3>
                <div className="space-y-2">
                  {[
                    { label: "Child's birthday story",  pages: 12, cumulative: 12, color: "bg-blue-400" },
                    { label: "Bedtime adventure",        pages: 8,  cumulative: 20, color: "bg-purple-400" },
                    { label: "School project book",      pages: 15, cumulative: 35, color: "bg-pink-400" },
                    { label: "Family vacation memory",   pages: 20, cumulative: 55, color: "bg-orange-400" },
                    { label: "Remaining pool",           pages: 45, cumulative: 100, color: "bg-muted" },
                  ].map(({ label, pages, cumulative, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold">{label}</span>
                        <span className="text-muted-foreground">{pages} pages (total: {cumulative}/100)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${cumulative}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Each book can be up to 15 pages (hard max). Remaining 45 pages available for more books this month.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Tier cards ── */}
        <section>
          <SectionTitle sub="Proposed subscription tiers based on production cost data and market positioning">
            Subscription Tiers
          </SectionTitle>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl bg-card p-6 chunky-border chunky-shadow-sm ${tier.recommended ? "ring-2 ring-purple-400" : ""}`}
              >
                {tier.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-purple-500 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white chunky-border">
                      Recommended
                    </span>
                  </div>
                )}

                {/* Tier header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white ${tier.color} mb-2`}>
                      {tier.name}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-3xl font-black">
                        {tier.price === 0 ? "Free" : `$${tier.price}`}
                      </span>
                      {tier.price > 0 && <span className="text-xs text-muted-foreground">/mo</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{tier.positioning}</p>
                  </div>
                </div>

                {/* Page pool highlight */}
                <div className="rounded-xl bg-muted/40 p-3 mb-4 chunky-border text-center">
                  <p className={`font-display text-2xl font-black ${tier.textAccent}`}>{tier.page_pool}</p>
                  <p className="text-xs font-bold text-muted-foreground">pages / month</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">max {tier.hard_max_per_book} per book</p>
                </div>

                {/* Features */}
                <div className="space-y-2 mb-4">
                  {tier.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs font-semibold">
                      <CheckCircle className={`h-3.5 w-3.5 shrink-0 ${tier.textAccent}`} strokeWidth={2.5} />
                      {f}
                    </div>
                  ))}
                </div>

                {/* Economics */}
                <div className="pt-3 border-t-2 border-foreground/5 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">COGS at avg usage</span>
                    <span className="font-bold">{fmtCost(tier.cogs_at_avg)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Gross margin</span>
                    <span className={`font-bold ${tier.margin_pct === null ? "text-orange-500" : "text-green-600"}`}>
                      {tier.margin_pct === null ? "Loss leader" : `~${tier.margin_pct}%`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature comparison table ── */}
        <section>
          <SectionTitle sub="Side-by-side feature and limit comparison">
            Feature Matrix
          </SectionTitle>
          <div className="rounded-2xl bg-card chunky-border chunky-shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b-2 border-foreground/10">
                  <th className="text-left px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Feature</th>
                  {TIERS.map((t) => (
                    <th key={t.name} className="px-5 py-3 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white ${t.color}`}>
                        {t.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Monthly price",          values: ["Free", "$9.99", "$17.99", "$34.99"] },
                  { label: "Books per month",         values: ["3", "10", "20", "Unlimited"] },
                  { label: "Monthly page pool",       values: ["24", "100", "250", "600"] },
                  { label: "Max pages per book",      values: ["8", "15", "25", "40"] },
                  { label: "Art styles",              values: ["3", "8", "8", "8"] },
                  { label: "AI model tier",           values: ["Flash", "Flash + Pro", "Flash + Pro", "Flash + Pro"] },
                  { label: "AI narration",            values: [false, true, true, true] },
                  { label: "Voice options",           values: ["1", "3", "5", "5"] },
                  { label: "AI avatar generator",     values: [false, false, true, true] },
                  { label: "Priority generation",     values: [false, false, false, true] },
                  { label: "Commercial license",      values: [false, false, false, true] },
                  { label: "API access (beta)",       values: [false, false, false, true] },
                ].map(({ label, values }) => (
                  <tr key={label} className="border-b border-foreground/5 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 text-sm font-bold">{label}</td>
                    {values.map((v, i) => (
                      <td key={i} className="px-5 py-3 text-center">
                        {typeof v === "boolean" ? (
                          <div className="flex justify-center"><Check yes={v} /></div>
                        ) : (
                          <span className="text-sm font-semibold">{v}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Revenue projections ── */}
        <section>
          <SectionTitle sub="MRR projections at different user counts with estimated tier distribution">
            Revenue Projections
          </SectionTitle>
          <div className="rounded-2xl bg-card chunky-border chunky-shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b-2 border-foreground/10">
                  <th className="text-left px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Total Users</th>
                  <th className="text-center px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Free / Starter / Family / Creator</th>
                  <th className="text-right px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">MRR</th>
                  <th className="text-right px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">COGS</th>
                  <th className="text-right px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Gross Profit</th>
                  <th className="text-right px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Margin</th>
                </tr>
              </thead>
              <tbody>
                {PROJECTIONS.map((row) => {
                  const r = calcRevenue(row);
                  return (
                    <tr key={row.users} className="border-b border-foreground/5 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-display text-lg font-black">
                        {row.users.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-center text-xs font-mono text-muted-foreground">
                        {row.free_pct}% / {row.starter_pct}% / {row.family_pct}% / {row.creator_pct}%
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-green-600">{fmt(r.mrr)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{fmt(r.total_cogs)}</td>
                      <td className={`px-5 py-3 text-right font-bold ${r.gross_profit >= 0 ? "text-primary" : "text-destructive"}`}>
                        {fmt(r.gross_profit)}
                      </td>
                      <td className={`px-5 py-3 text-right font-bold ${r.margin_pct >= 40 ? "text-green-600" : r.margin_pct >= 0 ? "text-orange-500" : "text-destructive"}`}>
                        {r.margin_pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Includes $57/mo fixed infra. COGS = variable API costs at average usage per tier.
            Tier distribution based on typical B2C SaaS freemium conversion rates (3–15% paid).
          </p>
        </section>

        {/* ── Break-even analysis ── */}
        <section>
          <SectionTitle sub="How many paid users needed to cover fixed costs">
            Break-even Analysis
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Starter-only break-even",
                value: "13 users",
                sub: "13 × ($9.99 − $4.38) ≈ $73 > $57 fixed",
                color: "bg-blue-500",
                detail: "At $5.61 contribution margin per Starter user",
              },
              {
                label: "Family-only break-even",
                value: "5 users",
                sub: "5 × ($17.99 − $6.84) ≈ $56 ≈ $57 fixed",
                color: "bg-purple-500",
                detail: "At $11.15 contribution margin per Family user",
              },
              {
                label: "Creator-only break-even",
                value: "3 users",
                sub: "3 × ($34.99 − $11.16) ≈ $72 > $57 fixed",
                color: "bg-amber-500",
                detail: "At $23.83 contribution margin per Creator user",
              },
            ].map(({ label, value, sub, color, detail }) => (
              <div key={label} className="rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${color} chunky-border`}>
                    <Users className="h-4 w-4 text-white" strokeWidth={2.5} />
                  </span>
                  <span className="font-display text-3xl font-black">{value}</span>
                </div>
                <p className="text-sm font-extrabold">{label}</p>
                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                <p className="text-xs text-muted-foreground mt-0.5 italic">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-card p-5 chunky-border chunky-shadow-sm">
            <h3 className="font-display text-lg font-black mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" strokeWidth={2.5} />
              Key takeaways
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                "Free tier is a loss-leader: ~$3.48 COGS with $0 revenue. Strictly acquisition only — cap at 3 books/month.",
                "Family tier has the best contribution margin per dollar ($11.15) and targets the core use case (families with kids).",
                "Page pool prevents unused quota waste: a user who makes one 5-page book doesn't \"use up\" a book slot, lowering COGS.",
                "Regenerations draw from the page pool — each re-generation of a page costs ~$0.17 (illus) or ~$0.10 (narr).",
                "At 500 users with realistic conversion (35% paid), MRR ≈ $1.8k/mo vs $875 COGS + $57 infra ≈ 52% gross margin.",
                "Consider annual billing at 2-month discount (e.g., $99.90/yr for Starter) to improve cash flow and reduce churn.",
              ].map((point, i) => (
                <div key={i} className="flex gap-3 rounded-xl bg-muted/40 p-3">
                  <span className="font-display text-lg font-black text-primary shrink-0">{i + 1}</span>
                  <p className="text-sm text-muted-foreground">{point}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
