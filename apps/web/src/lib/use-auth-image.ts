/**
 * Authenticated image hook with module-level cache.
 *
 * Why a module-level cache?
 * - Component-local blob URLs get revoked on unmount (useEffect cleanup).
 *   In a page-flip book this kills images mid-animation as old pages unmount.
 * - A module-level Map keeps blob URLs alive for the whole session (a few MB
 *   of image data is fine).
 * - Concurrent requests for the same URL share one in-flight Promise, so we
 *   never fire duplicate fetches.
 */

import { useState, useEffect } from "react";

// url → resolved blob URL
const _cache = new Map<string, string>();
// url → in-flight fetch promise
const _pending = new Map<string, Promise<string | null>>();

function fetchAuthImage(url: string, token: string): Promise<string | null> {
  if (_cache.has(url)) return Promise.resolve(_cache.get(url)!);
  if (_pending.has(url)) return _pending.get(url)!;

  const promise = fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      _cache.set(url, blobUrl);
      _pending.delete(url);
      return blobUrl;
    })
    .catch(() => {
      _pending.delete(url);
      return null;
    });

  _pending.set(url, promise);
  return promise;
}

/**
 * Returns the blob URL for an authenticated image resource.
 * - Returns immediately if the URL is already cached.
 * - Does NOT revoke the blob URL on unmount — it stays valid for the session.
 * - Multiple components requesting the same URL share one fetch.
 */
export function useAuthImage(
  url: string,
  token: string | null,
  enabled: boolean
): string | null {
  // Initialise from cache synchronously so cached images render on first paint
  const [blobUrl, setBlobUrl] = useState<string | null>(
    () => (enabled && _cache.has(url) ? _cache.get(url)! : null)
  );

  useEffect(() => {
    if (!enabled || !token) {
      setBlobUrl(null);
      return;
    }

    // Already in cache — set immediately (handles token/url changes)
    if (_cache.has(url)) {
      setBlobUrl(_cache.get(url)!);
      return;
    }

    let cancelled = false;
    fetchAuthImage(url, token).then((result) => {
      if (!cancelled) setBlobUrl(result);
    });

    // Don't revoke on cleanup — the cache owns the URL lifetime
    return () => {
      cancelled = true;
    };
  }, [url, token, enabled]);

  return blobUrl;
}

/** Clear the entire cache (e.g., on sign-out). */
export function clearAuthImageCache() {
  _cache.forEach((url) => URL.revokeObjectURL(url));
  _cache.clear();
  _pending.clear();
}

/** Bust a single cached URL so the next useAuthImage call re-fetches it. */
export function bustAuthImageCache(url: string) {
  const blobUrl = _cache.get(url);
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  _cache.delete(url);
  _pending.delete(url);
}
