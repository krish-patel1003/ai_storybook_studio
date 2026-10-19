"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User, Mail, BookOpen, LogOut, Shield, Pencil, Check, X,
  Zap, Crown, Star, Layers, ArrowUpRight, RefreshCw, Plus, Receipt,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { XsSpinner } from "@/components/character-spinner";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierOut {
  name: string;
  display_name: string;
  price_usd: number;
  page_pool: number;
  hard_max_per_book: number;
  books_per_month: number | null;
  narration: boolean;
  avatars: boolean;
  pro_model: boolean;
  priority_queue: boolean;
  commercial_license: boolean;
  voice_count: number;
  art_style_count: number;
  is_current: boolean;
}

interface PackOut {
  name: string;
  display_name: string;
  pages: number;
  price_usd: number;
}

interface Purchase {
  id: string;
  created_at: string;
  kind: "subscription" | "topup" | string;
  description: string;
  amount_cents: number;
  currency: string;
  tier: string | null;
  pages: number | null;
}

interface SubscriptionOut {
  tier: string;
  display_name: string;
  status: string | null;
  page_pool_total: number;
  page_pool_used: number;
  page_pool_remaining: number;
  topup_pages_remaining: number;
  period_end: string | null;
  publishable_key: string;
  tiers: TierOut[];
  packs: PackOut[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  free:        { bg: "bg-slate-500",  text: "text-slate-600",  border: "border-slate-300" },
  storyteller: { bg: "bg-blue-500",   text: "text-blue-600",   border: "border-blue-300" },
  studio:      { bg: "bg-purple-500", text: "text-purple-600", border: "border-purple-300" },
};

const TIER_ICONS: Record<string, React.ElementType> = {
  free: Star, storyteller: Zap, studio: Crown,
};

function tierLabel(tier: TierOut) {
  return tier.price_usd === 0 ? "Free" : `$${tier.price_usd.toFixed(2)}/mo`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ── Subscription card ─────────────────────────────────────────────────────────

function SubscriptionSection({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const [sub, setSub] = useState<SubscriptionOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  useEffect(() => {
    const outcome = searchParams.get("checkout");
    if (outcome === "success") {
      const tier = searchParams.get("tier") ?? "";
      toast.success(`Welcome to ${tier.charAt(0).toUpperCase() + tier.slice(1)}! Your plan is now active.`);
    } else if (outcome === "canceled") {
      toast.info("Checkout canceled — you can upgrade any time.");
    }
    const topup = searchParams.get("topup");
    if (topup === "success") {
      toast.success("Pages added! Your top-up pages are ready to use. 🎉");
    } else if (topup === "canceled") {
      toast.info("Top-up canceled — no charge was made.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/billing/subscription`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSub)
      .finally(() => setLoading(false));
    fetch(`${API}/billing/purchases`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPurchases(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  async function handleUpgrade(tierName: string) {
    if (!token) return;
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
      toast.error(err instanceof Error ? err.message : "Could not start checkout — please try again.");
    } finally {
      setCheckingOut(null);
    }
  }

  async function handleTopup(pack: string) {
    if (!token) return;
    setBuyingPack(pack);
    try {
      const res = await fetch(`${API}/billing/topup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Could not start checkout");
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout — please try again.");
    } finally {
      setBuyingPack(null);
    }
  }

  async function handleManage() {
    if (!token) return;
    setOpeningPortal(true);
    try {
      const res = await fetch(`${API}/billing/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Could not open billing portal");
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open billing portal.");
    } finally {
      setOpeningPortal(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 h-48 animate-pulse rounded-3xl bg-muted" />
    );
  }

  if (!sub) {
    return (
      <div className="mt-6 rounded-3xl bg-card p-5 chunky-border text-sm text-muted-foreground text-center">
        Subscription info unavailable
      </div>
    );
  }

  const colors = TIER_COLORS[sub.tier] ?? TIER_COLORS.free;
  const TierIcon = TIER_ICONS[sub.tier] ?? Star;
  // Unified view: monthly allowance + any prepaid top-ups = total capacity this cycle.
  // The bar reflects usage against that total, so it never looks "full" while top-up
  // pages remain, and the label stays a single clean number no matter how many packs.
  const poolCapacity = sub.page_pool_total + sub.topup_pages_remaining;
  const poolRemaining = sub.page_pool_remaining;
  const poolUsed = Math.max(0, poolCapacity - poolRemaining);
  const poolPct = poolCapacity > 0 ? Math.min(100, Math.round((poolUsed / poolCapacity) * 100)) : 100;
  const isPaid = sub.tier !== "free";

  return (
    <div className="mt-6 space-y-4">
      {/* Current plan */}
      <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${colors.bg} chunky-border`}>
              <TierIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
            </span>
            <div>
              <p className="font-display text-lg font-black">{sub.display_name} Plan</p>
              {sub.status && sub.status !== "active" && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  sub.status === "past_due" ? "bg-red-100 text-red-700" :
                  sub.status === "trialing" ? "bg-green-100 text-green-700" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {sub.status.replace("_", " ")}
                </span>
              )}
            </div>
          </div>
          {isPaid && (
            <button
              onClick={handleManage}
              disabled={openingPortal}
              className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-bold chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-50"
            >
              {openingPortal ? <XsSpinner /> : <RefreshCw className="h-3 w-3" strokeWidth={2.5} />}
              Manage billing
            </button>
          )}
        </div>

        {/* Page pool */}
        <div className="rounded-2xl bg-background p-4 chunky-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-extrabold">Page pool</p>
            <p className="text-sm font-bold">
              <span className={poolRemaining <= 0 ? "text-destructive" : colors.text}>
                {poolRemaining}
              </span>
              <span className="text-muted-foreground"> {poolRemaining === 1 ? "page" : "pages"} left</span>
            </p>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                poolRemaining <= 0 ? "bg-destructive" : poolPct >= 80 ? "bg-amber-500" : colors.bg
              }`}
              style={{ width: `${poolPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>
              {poolUsed} of {poolCapacity} used
              {sub.topup_pages_remaining > 0 && (
                <span className="font-bold text-accent-foreground"> · {sub.topup_pages_remaining} from top-ups</span>
              )}
            </span>
            {sub.period_end && <span>Resets {fmtDate(sub.period_end)}</span>}
          </div>
        </div>

        {sub.tier === "free" && sub.page_pool_remaining <= 4 && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 font-bold border border-amber-200">
            Running low — upgrade to get more pages and unlock narration, avatars, and longer books.
          </p>
        )}
      </div>

      {/* Top-up page packs */}
      {sub.packs && sub.packs.length > 0 && (
        <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Plus className="h-4 w-4 text-primary" strokeWidth={2.5} />
            <p className="font-display text-base font-black">Need more pages?</p>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Buy a prepaid page pack. Top-up pages never expire and are used after your monthly pool runs out.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {sub.packs.map((pack) => (
              <div key={pack.name} className="rounded-2xl bg-background p-4 chunky-border text-center">
                <p className="font-display text-lg font-black">{pack.pages} pages</p>
                <p className="text-xs font-bold text-muted-foreground mb-1">{pack.display_name}</p>
                <p className="text-sm font-extrabold mb-3">${pack.price_usd.toFixed(2)}</p>
                <button
                  onClick={() => handleTopup(pack.name)}
                  disabled={!!buyingPack}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground py-2 text-xs font-extrabold chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0"
                >
                  {buyingPack === pack.name ? <XsSpinner /> : <Plus className="h-3.5 w-3.5" strokeWidth={3} />}
                  {buyingPack === pack.name ? "Redirecting…" : "Buy pack"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing history */}
      {purchases.length > 0 && (
        <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="h-4 w-4 text-primary" strokeWidth={2.5} />
            <p className="font-display text-base font-black">Billing history</p>
          </div>
          <ul className="divide-y-2 divide-foreground/5">
            {purchases.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">
                    {p.description}
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 align-middle text-[9px] font-extrabold uppercase tracking-wide ${p.kind === "topup" ? "bg-highlight text-foreground" : "bg-primary/15 text-primary"}`}>
                      {p.kind === "topup" ? "Top-up" : "Plan"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className="shrink-0 font-display text-sm font-black tabular-nums">
                  {p.amount_cents > 0 ? `${p.currency === "usd" ? "$" : ""}${(p.amount_cents / 100).toFixed(2)}${p.currency !== "usd" ? " " + p.currency.toUpperCase() : ""}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tier cards */}
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-3">
          {isPaid ? "Compare plans" : "Upgrade your plan"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sub.tiers.map((tier) => {
            const tc = TIER_COLORS[tier.name] ?? TIER_COLORS.free;
            const TIcon = TIER_ICONS[tier.name] ?? Star;
            const isCurrentTier = tier.is_current;
            const isPaidTier = tier.price_usd > 0;
            const isDowngrade = sub.tiers.findIndex(t => t.name === tier.name) <
                                sub.tiers.findIndex(t => t.name === sub.tier);

            return (
              <div
                key={tier.name}
                className={`rounded-2xl bg-card p-4 chunky-border overflow-hidden ${isCurrentTier ? "ring-2 ring-offset-0 " + tc.border.replace("border-", "ring-") : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${tc.bg}`}>
                    <TIcon className="h-3 w-3" strokeWidth={3} />
                    {tier.display_name}
                  </span>
                  {isCurrentTier && (
                    <span className="text-[10px] font-extrabold text-muted-foreground">Current</span>
                  )}
                </div>

                <p className="font-display text-xl font-black mb-1">{tierLabel(tier)}</p>

                <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
                  <p>{tier.page_pool} pages/month</p>
                  <p>{tier.books_per_month ?? "Unlimited"} books · {tier.art_style_count} styles</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {tier.narration && <span className="rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 font-bold">Narration</span>}
                    {tier.avatars && <span className="rounded-full bg-purple-100 text-purple-700 px-1.5 py-0.5 font-bold">Avatars</span>}
                    {tier.commercial_license && <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 font-bold">Commercial</span>}
                  </div>
                </div>

                {!isCurrentTier && isPaidTier && !isDowngrade && (
                  <button
                    onClick={() => handleUpgrade(tier.name)}
                    disabled={!!checkingOut}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold text-white ${tc.bg} chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0`}
                  >
                    {checkingOut === tier.name ? <XsSpinner /> : <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={3} />}
                    {checkingOut === tier.name ? "Redirecting…" : "Upgrade"}
                  </button>
                )}
                {!isCurrentTier && isPaid && isDowngrade && (
                  <button
                    onClick={handleManage}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold bg-muted chunky-border hover:-translate-y-0.5 transition-transform"
                  >
                    Switch via portal
                  </button>
                )}
                {isCurrentTier && (
                  <div className="flex items-center justify-center gap-1 rounded-xl bg-muted py-2 text-xs font-bold text-muted-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} /> Active
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { user, token, logout, isLoading, updateUser } = useAuth();
  const router = useRouter();
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingAuthorName, setEditingAuthorName] = useState(false);
  const [usernameValue, setUsernameValue] = useState(user?.username ?? "");
  const [authorNameValue, setAuthorNameValue] = useState(user?.author_name ?? "");
  const [saving, setSaving] = useState(false);

  function handleLogout() {
    logout();
    router.push("/");
  }

  async function saveUsername() {
    if (!token || !usernameValue.trim()) return;
    setSaving(true);
    try {
      await updateUser({ username: usernameValue.trim() });
      toast.success("Username updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update username");
    } finally {
      setSaving(false);
      setEditingUsername(false);
    }
  }

  async function saveAuthorName() {
    if (!token) return;
    setSaving(true);
    try {
      await updateUser({ author_name: authorNameValue.trim() || undefined });
      toast.success("Author name updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update author name");
    } finally {
      setSaving(false);
      setEditingAuthorName(false);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-3xl bg-muted" />
          ))}
        </div>
      </main>
    );
  }

  if (!user) {
    router.push("/auth/signin");
    return null;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-4xl font-black md:text-5xl">Your Account</h1>
      <p className="mt-2 text-muted-foreground">Manage your profile, preferences, and subscription.</p>

      {/* Avatar + username */}
      <div className="mt-8 flex items-center gap-4 rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground chunky-border">
          {user.username.charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          {editingUsername ? (
            <div className="flex items-center gap-2">
              <input
                value={usernameValue}
                onChange={(e) => setUsernameValue(e.target.value)}
                className="flex-1 rounded-xl border-[2px] border-foreground bg-background px-3 py-1.5 text-lg font-black focus:outline-none"
                autoFocus
              />
              <button onClick={saveUsername} disabled={saving} className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground chunky-border disabled:opacity-50">
                <Check className="h-4 w-4" strokeWidth={3} />
              </button>
              <button onClick={() => { setEditingUsername(false); setUsernameValue(user.username); }} className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border">
                <X className="h-4 w-4" strokeWidth={3} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-black">{user.username}</span>
              <button onClick={() => { setEditingUsername(true); setUsernameValue(user.username); }} className="rounded-full p-1 hover:bg-highlight transition-colors" title="Edit username">
                <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary chunky-border">
            <Mail className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Email</p>
            <p className="font-bold">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent chunky-border">
            <User className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Author Name</p>
            <p className="text-xs text-muted-foreground mb-1">Shown on book covers and exports</p>
            {editingAuthorName ? (
              <div className="flex items-center gap-2 mt-1">
                <input value={authorNameValue} onChange={(e) => setAuthorNameValue(e.target.value)} placeholder="e.g. Jane Smith" className="flex-1 rounded-xl border-[2px] border-foreground bg-background px-3 py-1.5 text-sm font-bold focus:outline-none" autoFocus />
                <button onClick={saveAuthorName} disabled={saving} className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground chunky-border disabled:opacity-50">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
                <button onClick={() => { setEditingAuthorName(false); setAuthorNameValue(user.author_name ?? ""); }} className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border">
                  <X className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold">{user.author_name || <span className="text-muted-foreground italic font-normal text-sm">Not set — using username</span>}</p>
                <button onClick={() => { setEditingAuthorName(true); setAuthorNameValue(user.author_name ?? ""); }} className="rounded-full p-1 hover:bg-highlight transition-colors" title="Edit author name">
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-highlight chunky-border">
            <Shield className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Account type</p>
            <p className="font-bold">{user.avatar_url ? "Google account" : "Email & password"}</p>
          </div>
        </div>
      </div>

      {/* Subscription */}
      {token && <SubscriptionSection token={token} />}

      {/* Quick links */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <a href="/library" className="flex items-center gap-2.5 rounded-2xl bg-card p-4 chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
          <BookOpen className="h-5 w-5 text-primary" strokeWidth={2.5} />
          <span className="font-bold text-sm">My Library</span>
        </a>
        <a href="/create" className="flex items-center gap-2.5 rounded-2xl bg-primary p-4 chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
          <BookOpen className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          <span className="font-bold text-sm text-primary-foreground">New Storybook</span>
        </a>
      </div>

      {/* Sign out */}
      <div className="mt-8 border-t-[2px] border-foreground/10 pt-6">
        <button onClick={handleLogout} className="flex items-center gap-2.5 rounded-2xl bg-card px-5 py-3 text-sm font-bold text-destructive chunky-border hover:bg-destructive/10 transition-colors">
          <LogOut className="h-4 w-4" strokeWidth={2.5} />
          Sign out
        </button>
      </div>
    </main>
  );
}
