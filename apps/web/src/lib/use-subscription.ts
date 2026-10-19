"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface SubscriptionInfo {
  tier: string;
  display_name: string;
  narration: boolean;
  parent_mode: boolean;
  avatars: boolean;
  page_pool_remaining: number;
  topup_pages_remaining: number;
  avatars_per_month: number;
  avatars_used: number;
  avatars_remaining: number;
}

/**
 * Fetches the current user's subscription once and exposes the feature flags for
 * the active tier. Used to gate features (e.g. narration) in the UI so users on a
 * plan without a feature see a locked/upgrade state instead of hitting a 402.
 */
export function useSubscription() {
  const { token } = useAuth();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API}/billing/subscription`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const cur = (data.tiers ?? []).find((t: { is_current: boolean }) => t.is_current) ?? {};
        setSub({
          tier: data.tier,
          display_name: data.display_name,
          narration: !!cur.narration,
          parent_mode: !!cur.parent_mode,
          avatars: !!cur.avatars,
          page_pool_remaining: data.page_pool_remaining ?? 0,
          topup_pages_remaining: data.topup_pages_remaining ?? 0,
          avatars_per_month: data.avatars_per_month ?? 0,
          avatars_used: data.avatars_used ?? 0,
          avatars_remaining: data.avatars_remaining ?? 0,
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return { sub, loading };
}
