"use client";

/**
 * BookPicker
 * Fetches the user's completed books and lets them choose one.
 * Used on the Export and KDP pages so the user always picks explicitly
 * rather than getting the last-visited book auto-loaded.
 */

import { useEffect, useState, useRef } from "react";
import { BookOpen, Loader2, AlertCircle, ImageIcon, ChevronRight, Baby } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type BookSummaryOut, type BookOut, type ChildProfile } from "@/lib/api";
import { BookExportMenu } from "@/components/book-export-menu";

const isImgAvatar = (v: string) => v.startsWith("http://") || v.startsWith("https://");

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
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [profileFilter, setProfileFilter] = useState<string>("all");
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
    api.profiles.list(token).then(setProfiles).catch(() => {});
  }, [token]);

  const profileFor = (id: string | null) => (id ? profiles.find((p) => p.id === id) ?? null : null);
  const shownBooks = profileFilter === "all" ? books : books.filter((b) => b.child_profile_id === profileFilter);
  const selectedFilterProfile = profiles.find((p) => p.id === profileFilter) ?? null;

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black md:text-4xl">
            {heading ?? "Choose a book"}
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {subheading ?? "Select a completed book to continue."}
          </p>
        </div>

        {/* Child-profile filter */}
        {profiles.length > 0 && (
          <label className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-2 chunky-border chunky-shadow-sm shrink-0">
            {selectedFilterProfile ? (
              isImgAvatar(selectedFilterProfile.avatar_emoji)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={selectedFilterProfile.avatar_emoji} alt="" className="h-6 w-6 rounded-full object-cover chunky-border shrink-0" />
                : <span className="text-lg leading-none shrink-0">{selectedFilterProfile.avatar_emoji}</span>
            ) : (
              <Baby className="h-4 w-4 text-primary shrink-0" strokeWidth={2.5} />
            )}
            <span className="text-xs font-extrabold text-muted-foreground">Child</span>
            <select
              value={profileFilter}
              onChange={(e) => setProfileFilter(e.target.value)}
              className="bg-transparent text-sm font-extrabold text-foreground outline-none cursor-pointer pr-1"
            >
              <option value="all">All children</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
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

      {/* No match for the child filter */}
      {!loading && books.length > 0 && shownBooks.length === 0 && !error && (
        <div className="rounded-3xl bg-card p-10 chunky-border text-center space-y-2">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="font-bold text-muted-foreground">No books for this child yet.</p>
          <button onClick={() => setProfileFilter("all")} className="text-sm font-extrabold text-primary underline underline-offset-2">Show all books</button>
        </div>
      )}

      {/* Book list */}
      {!loading && shownBooks.length > 0 && (
        <div className="space-y-3">
          {shownBooks.map((b) => {
            const isLoading = selecting === b.id;
            const profile = profileFor(b.child_profile_id);

            return (
              <div
                key={b.id}
                className="group flex items-center gap-3 rounded-2xl bg-card px-3 py-3 chunky-border chunky-shadow-sm"
              >
                {/* Export button — independent of the row's select action */}
                <div className="shrink-0">
                  <BookExportMenu bookId={b.id} title={b.title} align="left" />
                </div>

                {/* Main clickable area — selects the book (keeps existing behavior) */}
                <button
                  onClick={() => handleSelect(b)}
                  disabled={!!selecting}
                  className="flex flex-1 min-w-0 items-center gap-4 text-left hover:-translate-y-0.5 transition-transform disabled:opacity-60"
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
                </button>

                {/* Child profile who created it */}
                <div className="hidden sm:flex shrink-0 items-center gap-1.5 rounded-full bg-background px-2.5 py-1.5 chunky-border" title={profile ? `Created for ${profile.name}` : "No child profile"}>
                  {profile ? (
                    isImgAvatar(profile.avatar_emoji)
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={profile.avatar_emoji} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                      : <span className="text-base leading-none">{profile.avatar_emoji}</span>
                  ) : (
                    <Baby className="h-4 w-4 text-muted-foreground" strokeWidth={2.5} />
                  )}
                  <span className="text-xs font-extrabold max-w-[80px] truncate">{profile ? profile.name : "Kid"}</span>
                </div>

                {/* Arrow / spinner */}
                <button onClick={() => handleSelect(b)} disabled={!!selecting} className="shrink-0" aria-label="Open">
                  {isLoading
                    ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    : <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={2.5} />
                  }
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
