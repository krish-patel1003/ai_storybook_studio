"use client";

/**
 * BookPicker
 * Fetches the user's completed books and lets them choose one.
 * Used on the Export and KDP pages so the user always picks explicitly
 * rather than getting the last-visited book auto-loaded.
 */

import { useEffect, useState, useRef } from "react";
import { BookOpen, Loader2, AlertCircle, ImageIcon, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type BookSummaryOut, type BookOut } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Fetches a protected image URL with the auth token and renders it as a blob URL
function CoverImage({ path, token }: { path: string; token: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        const url = URL.createObjectURL(blob);
        prevUrl.current = url;
        setObjectUrl(url);
      })
      .catch(() => {/* silently fall back to placeholder */});

    return () => {
      cancelled = true;
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    };
  }, [path, token]);

  if (!objectUrl) return <ImageIcon className="h-6 w-6 text-muted-foreground/40" />;
  return <img src={objectUrl} alt="Cover" className="h-full w-full object-cover" />;
}

interface Props {
  /** Called once the user selects a book and the full data has loaded. */
  onSelect: (book: BookOut) => void;
  /** Heading shown above the list. */
  heading?: string;
  /** Subheading shown above the list. */
  subheading?: string;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function BookPicker({ onSelect, heading, subheading }: Props) {
  const { token } = useAuth();
  const [books, setBooks] = useState<BookSummaryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.books
      .list(token)
      .then((all) => setBooks(all.filter((b) => b.stage === "complete")))
      .catch(() => setError("Could not load your books. Please try again."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSelect(summary: BookSummaryOut) {
    if (!token) return;
    setSelecting(summary.id);
    try {
      const full = await api.books.get(token, summary.id);
      onSelect(full);
    } catch {
      setError("Could not load that book. Please try again.");
      setSelecting(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-black md:text-4xl">
          {heading ?? "Choose a book"}
        </h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {subheading ?? "Select a completed book to continue."}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 border-2 border-destructive px-4 py-3 text-sm font-bold text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your books…
        </div>
      )}

      {/* Empty */}
      {!loading && books.length === 0 && !error && (
        <div className="rounded-3xl bg-card p-10 chunky-border text-center space-y-3">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="font-bold text-muted-foreground">
            No completed books yet. Create and illustrate a book first.
          </p>
        </div>
      )}

      {/* Book list */}
      {!loading && books.length > 0 && (
        <div className="space-y-3">
          {books.map((b) => {
            const isLoading = selecting === b.id;

            return (
              <button
                key={b.id}
                onClick={() => handleSelect(b)}
                disabled={!!selecting}
                className="group w-full flex items-center gap-4 rounded-2xl bg-card px-4 py-3 text-left chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-60"
              >
                {/* Cover thumbnail — fetched with auth headers */}
                <div className="shrink-0 h-14 w-14 overflow-hidden rounded-xl bg-muted chunky-border flex items-center justify-center">
                  {b.cover_image_url && token ? (
                    <CoverImage path={b.cover_image_url} token={token} />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-black truncate">{b.title}</p>
                  <p className="text-xs font-bold text-muted-foreground mt-0.5">
                    {b.page_count} pages · Ages {b.age_range} · {b.art_style}
                    <span className="mx-1.5 opacity-40">·</span>
                    {relativeTime(b.updated_at)}
                  </p>
                </div>

                {/* Arrow / spinner */}
                <div className="shrink-0">
                  {isLoading
                    ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    : <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={2.5} />
                  }
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
