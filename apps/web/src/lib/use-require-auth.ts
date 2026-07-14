"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

/**
 * Guards a protected page: once auth has loaded, unauthenticated visitors are
 * redirected to the sign-in page (with a `next` param so they return here after
 * logging in). Returns { user, isLoading } so the page can render a placeholder
 * while the redirect happens.
 */
export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/auth/signin?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, pathname, router]);

  return { user, isLoading };
}
