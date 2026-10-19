"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, X, Star, Zap, Layers, Crown, ArrowRight, BookOpen,
  Mic, User, Palette, FileText, Globe, Headphones,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { XsSpinner } from "@/components/character-spinner";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Data ──────────────────────────────────────────────────────────────────────

const TIERS = [
  {
    name: "free",
    label: "Free",
    price: 0,
    color: "bg-slate-500",
    textColor: "text-slate-600",
    borderColor: "border-slate-300",
    ringColor: "ring-slate-300",
    Icon: Star,
    headline: "Try it out",
    sub: "6 pages to create your first storybook",
    pages: 6,
    maxPerBook: 6,
    books: 1,
    narration: false,
    avatars: 1,
    proModel: false,
    parentMode: false,
    remakes: 0,
    commercial: false,
    voices: 1,
    artStyles: 3,
    cta: "Get started free",
  },
  {
    name: "storyteller",
    label: "Storyteller",
    price: 9.99,
    color: "bg-blue-500",
    textColor: "text-blue-600",
    borderColor: "border-blue-300",
    ringColor: "ring-blue-400",
    Icon: Zap,
    headline: "For storytellers",
    sub: "24 pages, remakes & parent mode editing",
    pages: 24,
    maxPerBook: 12,
    books: null,
    narration: false,
    avatars: 2,
    proModel: true,
    parentMode: true,
    remakes: 1,
    commercial: false,
    voices: 1,
    artStyles: 8,
    cta: "Start for $9.99/mo",
    popular: true,
  },
  {
    name: "studio",
    label: "Studio",
    price: 15.99,
    color: "bg-purple-500",
    textColor: "text-purple-600",
    borderColor: "border-purple-300",
    ringColor: "ring-purple-400",
    Icon: Crown,
    headline: "The full studio",
    sub: "Everything in Storyteller + narration & avatars",
    pages: 24,
    maxPerBook: 12,
    books: null,
    narration: true,
    avatars: 3,
    proModel: true,
    parentMode: true,
    remakes: 1,
    commercial: false,
    voices: 3,
    artStyles: 8,
    cta: "Start for $15.99/mo",
  },
] as const;

const TOPUP_PACKS = [
  { name: "mini",  label: "Mini Pack",  pages: 10, price: 4.99 },
  { name: "value", label: "Value Pack", pages: 25, price: 9.99 },
  { name: "bulk",  label: "Bulk Pack",  pages: 60, price: 19.99 },
] as const;

const FEATURES = [
  { icon: BookOpen, label: "Pages/month", key: "pages" as const, format: (v: number) => `${v} pages` },
  { icon: FileText, label: "Books/month", key: "books" as const, format: (v: number | null) => v ? `${v} books` : "Unlimited" },
  { icon: Palette, label: "Picture remakes", key: "remakes" as const, format: (v: number) => v ? `${v} per page` : false },
  { icon: User, label: "Parent mode editing", key: "parentMode" as const, format: (v: boolean) => v },
  { icon: Mic, label: "AI narration", key: "narration" as const, format: (v: boolean) => v },
  { icon: User, label: "AI avatars", key: "avatars" as const, format: (v: number) => v ? `${v}/month` : false },
  { icon: Star, label: "Pro AI model", key: "proModel" as const, format: (v: boolean) => v },
  { icon: Headphones, label: "Voice options", key: "voices" as const, format: (v: number) => `${v} voices` },
  { icon: Palette, label: "Art styles", key: "artStyles" as const, format: (v: number) => `${v} styles` },
] as const;

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({ tier, onUpgrade, checkingOut }: {
  tier: typeof TIERS[number];
  onUpgrade: (name: string) => void;
  checkingOut: string | null;
}) {
  const TIcon = tier.Icon;

  return (
    <div className={`relative flex flex-col rounded-3xl bg-card chunky-border chunky-shadow-sm p-6 ${
      "popular" in tier && tier.popular ? "ring-2 " + tier.ringColor : ""
    }`}>
      {"popular" in tier && tier.popular && (
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white ${tier.color} chunky-border`}>
          Most popular
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tier.color} chunky-border`}>
          <TIcon className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </span>
        <span className="font-display text-lg font-black">{tier.label}</span>
      </div>

      <div className="mb-1">
        <span className="font-display text-4xl font-black">
          {tier.price === 0 ? "Free" : `$${tier.price}`}
        </span>
        {tier.price > 0 && <span className="text-muted-foreground text-sm font-bold ml-1">/month</span>}
      </div>
      <p className="text-sm text-muted-foreground mb-6">{tier.sub}</p>

      <ul className="space-y-2 mb-8 flex-1">
        <li className="flex items-center gap-2 text-sm font-bold">
          <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
          {tier.pages} pages/month
        </li>
        <li className="flex items-center gap-2 text-sm font-bold">
          <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
          {tier.books ? `${tier.books} book${tier.books > 1 ? "s" : ""}/month` : "Unlimited books"}
        </li>
        <li className={`flex items-center gap-2 text-sm font-bold ${!tier.remakes ? "opacity-40" : ""}`}>
          {tier.remakes
            ? <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
            : <X className="h-4 w-4 shrink-0" strokeWidth={3} />
          }
          {tier.remakes ? `${tier.remakes} picture remake/page` : "No picture remakes"}
        </li>
        <li className={`flex items-center gap-2 text-sm font-bold ${!tier.parentMode ? "opacity-40" : ""}`}>
          {tier.parentMode
            ? <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
            : <X className="h-4 w-4 shrink-0" strokeWidth={3} />
          }
          Parent mode editing
        </li>
        <li className={`flex items-center gap-2 text-sm font-bold ${!tier.narration ? "opacity-40" : ""}`}>
          {tier.narration
            ? <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
            : <X className="h-4 w-4 shrink-0" strokeWidth={3} />
          }
          AI narration
        </li>
        <li className={`flex items-center gap-2 text-sm font-bold ${!tier.avatars ? "opacity-40" : ""}`}>
          {tier.avatars
            ? <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
            : <X className="h-4 w-4 shrink-0" strokeWidth={3} />
          }
          {tier.avatars ? `${tier.avatars} AI avatar${tier.avatars !== 1 ? "s" : ""}/month` : "AI avatar portraits"}
        </li>
        {tier.proModel && (
          <li className="flex items-center gap-2 text-sm font-bold">
            <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
            Pro AI model
          </li>
        )}
        {tier.commercial && (
          <li className="flex items-center gap-2 text-sm font-bold">
            <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
            Commercial license
          </li>
        )}
        <li className="flex items-center gap-2 text-sm font-bold">
          <Check className={`h-4 w-4 ${tier.textColor} shrink-0`} strokeWidth={3} />
          {tier.voices} voice{tier.voices > 1 ? "s" : ""} · {tier.artStyles} art styles
        </li>
      </ul>

      {tier.price === 0 ? (
        <Link
          href="/auth/signin"
          className={`flex items-center justify-center gap-2 rounded-2xl py-3 font-extrabold text-sm bg-secondary chunky-border hover:-translate-y-0.5 transition-transform`}
        >
          {tier.cta}
          <ArrowRight className="h-4 w-4" strokeWidth={3} />
        </Link>
      ) : (
        <button
          onClick={() => onUpgrade(tier.name)}
          disabled={!!checkingOut}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3 font-extrabold text-sm text-white ${tier.color} chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0`}
        >
          {checkingOut === tier.name ? <XsSpinner /> : null}
          {checkingOut === tier.name ? "Redirecting…" : tier.cta}
          {!checkingOut && <ArrowRight className="h-4 w-4" strokeWidth={3} />}
        </button>
      )}
    </div>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "What counts as a page?",
    a: "Each illustrated page in your book uses 1 page from your pool. Narration doesn't use pages — once you illustrate a page, you can narrate it for free.",
  },
  {
    q: "Does unused pool carry over?",
    a: "Pages reset at the start of each billing period and don't roll over. Use them to create as many books as you like within the month.",
  },
  {
    q: "Can I exceed my per-book limit?",
    a: "The per-book hard limit is a creative constraint, not a billing one. A book with 6 pages still uses 6 from your pool — making a shorter book frees up pool for other books.",
  },
  {
    q: "Can I upgrade or downgrade any time?",
    a: "Yes. Upgrades take effect immediately. Downgrades take effect at the end of the current billing period so you keep your access until then.",
  },
  {
    q: "Is there a free trial?",
    a: "The Free plan lets you create one 6-page illustrated storybook permanently — no credit card needed — so you can see exactly how it works before upgrading.",
  },
  {
    q: "What is parent mode?",
    a: "Parent mode is advanced editing — custom page layouts, fonts, colours and the author name. It's included on the Storyteller and Studio plans. Studio also adds AI narration.",
  },
];

function FAQ_Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-card chunky-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left font-bold text-sm hover:bg-highlight transition-colors"
      >
        {q}
        <span className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-45" : ""}`}>
          +
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  async function handleUpgrade(tierName: string) {
    if (!token) {
      router.push(`/auth/signin?next=/pricing`);
      return;
    }
    setCheckingOut(tierName);
    try {
      const res = await fetch(`${API}/billing/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setCheckingOut(null);
    }
  }

  async function handleBuyPack(packName: string) {
    if (!token) {
      router.push(`/auth/signin?next=/pricing`);
      return;
    }
    setCheckingOut(`pack:${packName}`);
    try {
      const res = await fetch(`${API}/billing/topup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setCheckingOut(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      {/* Hero */}
      <div className="py-16 text-center">
        <h1 className="font-display text-5xl font-black md:text-6xl lg:text-7xl">
          Simple, honest pricing
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
          Pay for the pages you use. No per-image fees, no hidden charges. Every plan includes illustrated pages, PDF export, and our full art style library.
        </p>
        {user && (
          <p className="mt-4 text-sm font-bold">
            You&apos;re signed in as <span className="text-primary">{user.username}</span>.{" "}
            <Link href="/account" className="underline underline-offset-2">Manage your subscription →</Link>
          </p>
        )}
      </div>

      {/* Tier cards */}
      <div data-tour="pricing-plans" className="grid gap-6 sm:grid-cols-3 max-w-5xl mx-auto">
        {TIERS.map((tier) => (
          <TierCard key={tier.name} tier={tier} onUpgrade={handleUpgrade} checkingOut={checkingOut} />
        ))}
      </div>

      {/* Top-up page packs */}
      <div className="mt-16 max-w-5xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl font-black">Need more pages?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Buy a prepaid page pack any time — top-up pages never expire and are used after your monthly pool runs out.
          </p>
        </div>
        <div data-tour="pricing-topups" className="grid gap-4 sm:grid-cols-3">
          {TOPUP_PACKS.map((pack) => (
            <div key={pack.name} className="flex flex-col rounded-3xl bg-card p-6 text-center chunky-border chunky-shadow-sm">
              <p className="font-display text-3xl font-black">{pack.pages}</p>
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground mb-3">pages · {pack.label}</p>
              <p className="font-display text-xl font-black mb-1">${pack.price.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mb-4">${(pack.price / pack.pages).toFixed(2)} / page</p>
              <button
                onClick={() => handleBuyPack(pack.name)}
                disabled={!!checkingOut}
                className="mt-auto flex items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0"
              >
                {checkingOut === `pack:${pack.name}` ? <XsSpinner /> : null}
                {checkingOut === `pack:${pack.name}` ? "Redirecting…" : "Buy pack"}
                {checkingOut !== `pack:${pack.name}` && <ArrowRight className="h-4 w-4" strokeWidth={3} />}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Top-up pages are added instantly after checkout — or manage them from your <Link href="/account" className="underline underline-offset-2 font-bold">account page</Link>.
        </p>
      </div>

      {/* Feature comparison table */}
      <div className="mt-20">
        <h2 className="font-display text-3xl font-black text-center mb-8">Full comparison</h2>
        <div className="overflow-x-auto rounded-3xl chunky-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[2px] border-foreground/10">
                <th className="py-4 px-5 text-left font-extrabold w-44">Feature</th>
                {TIERS.map((t) => {
                  const TIcon = t.Icon;
                  return (
                    <th key={t.name} className="py-4 px-4 text-center font-extrabold">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-white ${t.color}`}>
                        <TIcon className="h-3 w-3" strokeWidth={3} />
                        {t.label}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map(({ icon: FIcon, label, key, format }, idx) => (
                <tr key={key} className={idx % 2 === 0 ? "" : "bg-highlight/40"}>
                  <td className="py-3 px-5 font-bold flex items-center gap-2">
                    <FIcon className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2} />
                    {label}
                  </td>
                  {TIERS.map((t) => {
                    const raw = t[key] as never;
                    const formatted = (format as (v: never) => string | boolean)(raw);
                    return (
                      <td key={t.name} className="py-3 px-4 text-center">
                        {typeof formatted === "boolean" ? (
                          formatted
                            ? <Check className={`h-4 w-4 mx-auto ${t.textColor}`} strokeWidth={3} />
                            : <X className="h-4 w-4 mx-auto text-muted-foreground opacity-40" strokeWidth={2.5} />
                        ) : (
                          <span className="font-bold">{formatted}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Price row */}
              <tr className="border-t-[2px] border-foreground/10 bg-card">
                <td className="py-3 px-5 font-extrabold">Monthly price</td>
                {TIERS.map((t) => (
                  <td key={t.name} className="py-3 px-4 text-center font-display font-black">
                    {t.price === 0 ? "Free" : `$${t.price}`}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="mt-20 max-w-2xl mx-auto">
        <h2 className="font-display text-3xl font-black text-center mb-8">Common questions</h2>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <FAQ_Item key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-20 text-center rounded-3xl bg-primary p-10 chunky-border">
        <h2 className="font-display text-3xl font-black text-primary-foreground md:text-4xl">
          Ready to create your first story?
        </h2>
        <p className="mt-3 text-primary-foreground/80 mb-6">
          Start free — no credit card required. Upgrade when you need more pages.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/auth/signin"
            className="flex items-center gap-2 rounded-2xl bg-primary-foreground px-6 py-3 font-extrabold text-primary chunky-border hover:-translate-y-0.5 transition-transform"
          >
            <BookOpen className="h-5 w-5" strokeWidth={2.5} />
            Get started free
          </Link>
          <button
            onClick={() => handleUpgrade("storyteller")}
            disabled={!!checkingOut}
            className="flex items-center gap-2 rounded-2xl bg-blue-500 px-6 py-3 font-extrabold text-white chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-60"
          >
            {checkingOut === "storyteller" ? <XsSpinner /> : <Zap className="h-5 w-5" strokeWidth={2.5} />}
            Start Storyteller — $9.99/mo
          </button>
        </div>
      </div>
    </main>
  );
}
