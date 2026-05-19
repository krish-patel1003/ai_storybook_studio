"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Sparkles,
  RefreshCw,
  BookOpen,
  Loader2,
  ImageIcon,
  Check,
  ArrowLeft,
  Play,
  Zap,
  Clock,
  SkipForward,
  Eye,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, pageImageUrl, type PageOut } from "@/lib/api";
import { useRelativeTime } from "@/lib/use-relative-time";
import { toast } from "sonner";

// ── Authenticated image hook ──────────────────────────────────────────────────

function useAuthImage(url: string, token: string | null, hasImage: boolean) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasImage || !token) {
      setBlobUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token, hasImage]);

  return blobUrl;
}

// ── Timer hook ────────────────────────────────────────────────────────────────

function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setElapsed(0);
    intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setElapsed(0);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec.toString().padStart(2, "0")}s` : `${s}s`;
  };

  return { elapsed, formatted: fmt(elapsed), start, stop, reset };
}

// ── No-book placeholder ───────────────────────────────────────────────────────

function NoBook() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-32 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-3xl bg-muted chunky-border">
        <BookOpen className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="font-display text-2xl font-black">No book loaded</h2>
        <p className="mt-1 text-muted-foreground">Open a book from your library first.</p>
      </div>
      <Link href="/library" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
        Open library
      </Link>
    </div>
  );
}

// ── Page card ─────────────────────────────────────────────────────────────────

function PageCard({
  page,
  bookId,
  token,
  status,
  elapsed,
  onGenerate,
}: {
  page: PageOut;
  bookId: string;
  token: string | null;
  status: "idle" | "generating" | "done" | "error";
  elapsed: number;
  onGenerate: () => void;
}) {
  const imgUrl = pageImageUrl(bookId, page.id);
  const blobUrl = useAuthImage(imgUrl, token, page.has_image);

  const fmt = (s: number) => `${Math.floor(s / 60) > 0 ? `${Math.floor(s / 60)}m ` : ""}${(s % 60).toString().padStart(2, "0")}s`;

  return (
    <div className={`group flex flex-col rounded-3xl bg-card chunky-border chunky-shadow-sm overflow-hidden transition-all ${
      status === "generating" ? "ring-2 ring-primary/50" : ""
    }`}>
      {/* Illustration area */}
      <div className="relative aspect-[4/3] bg-muted border-b-[2.5px] border-foreground overflow-hidden">
        {status === "generating" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-xs font-bold text-muted-foreground">Generating…</p>
              {elapsed > 0 && (
                <p className="text-xs text-primary font-extrabold mt-0.5 flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" /> {fmt(elapsed)}
                </p>
              )}
            </div>
          </div>
        ) : blobUrl ? (
          <img
            src={blobUrl}
            alt={`Page ${page.order} illustration`}
            className="h-full w-full object-cover"
          />
        ) : page.has_image ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin opacity-40" />
            <span className="text-xs font-bold opacity-50">Loading…</span>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-30" strokeWidth={1.5} />
            <span className="text-xs font-bold opacity-50">
              {status === "error" ? "Failed" : "Not illustrated"}
            </span>
          </div>
        )}

        {/* Page number */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-background font-display text-sm font-black chunky-border">
            {page.is_cover ? "C" : page.order}
          </span>
        </div>

        {/* Status badge */}
        {status === "done" && blobUrl && (
          <div className="absolute bottom-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
              <Check className="h-3 w-3" strokeWidth={3} /> Done
            </span>
          </div>
        )}
        {status === "error" && (
          <div className="absolute bottom-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
              Failed
            </span>
          </div>
        )}
      </div>

      {/* Text */}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          {page.is_cover ? "Cover" : page.narrative_role}
        </span>
        {page.text ? (
          <p className="text-sm leading-relaxed line-clamp-3">{page.text}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No text yet</p>
        )}
      </div>

      {/* Per-page generate button */}
      <div className="px-4 pb-4">
        <button
          onClick={onGenerate}
          disabled={status === "generating"}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-background py-2 text-xs font-extrabold chunky-border hover:bg-secondary transition-colors disabled:opacity-40"
        >
          {status === "generating" ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
          ) : page.has_image ? (
            <><RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} /> Regenerate</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} /> Generate</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Mode = "one-by-one" | "all";
type Concurrency = "sync" | "async";
type PageStatus = "idle" | "generating" | "done" | "error";

export default function EditorPage() {
  const { token } = useAuth();
  const { book, updateBook } = useBook();
  const lastSaved = useRelativeTime(book?.updated_at);

  const [mode, setMode] = useState<Mode>("one-by-one");
  const [concurrency, setConcurrency] = useState<Concurrency>("sync");
  const [pageStatuses, setPageStatuses] = useState<Record<string, PageStatus>>({});
  const [pageElapsed, setPageElapsed] = useState<Record<string, number>>({});
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef(false);
  const timer = useTimer();

  // Per-page timers
  const pageTimerRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  function startPageTimer(pageId: string) {
    setPageElapsed((prev) => ({ ...prev, [pageId]: 0 }));
    pageTimerRefs.current[pageId] = setInterval(() => {
      setPageElapsed((prev) => ({ ...prev, [pageId]: (prev[pageId] ?? 0) + 1 }));
    }, 1000);
  }

  function stopPageTimer(pageId: string) {
    if (pageTimerRefs.current[pageId]) {
      clearInterval(pageTimerRefs.current[pageId]);
      delete pageTimerRefs.current[pageId];
    }
  }

  function setStatus(pageId: string, status: PageStatus) {
    setPageStatuses((prev) => ({ ...prev, [pageId]: status }));
  }

  async function generateOnePage(page: PageOut): Promise<boolean> {
    if (!token || !book) return false;
    setStatus(page.id, "generating");
    startPageTimer(page.id);
    try {
      const updated = await api.books.illustratePage(token, book.id, page.id);
      updateBook({ pages: updated.pages });
      setStatus(page.id, "done");
      return true;
    } catch (e: any) {
      setStatus(page.id, "error");
      toast.error(`Page ${page.order} failed: ${e.message ?? "Unknown error"}`);
      return false;
    } finally {
      stopPageTimer(page.id);
    }
  }

  async function handleGenerateAll() {
    if (!token || !book) return;
    abortRef.current = false;
    setIsRunning(true);
    timer.start();

    const pages = [...book.pages].sort((a, b) => a.order - b.order);

    try {
      if (mode === "one-by-one" || concurrency === "sync") {
        // Sequential — one at a time, show each as it comes back
        for (const page of pages) {
          if (abortRef.current) break;
          await generateOnePage(page);
        }
      } else {
        // Async — fire all simultaneously
        await Promise.all(pages.map((page) => generateOnePage(page)));
      }
      toast.success("All illustrations complete!");
    } finally {
      timer.stop();
      setIsRunning(false);
    }
  }

  async function handleGenerateSingle(page: PageOut) {
    if (isRunning) return;
    await generateOnePage(page);
  }

  function handleStop() {
    abortRef.current = true;
  }

  if (!book) return <main className="mx-auto max-w-7xl px-4 py-10"><NoBook /></main>;

  const allPages = [...book.pages].sort((a, b) => a.order - b.order);
  const illustratedCount = allPages.filter((p) => p.has_image).length;
  const totalCount = allPages.length;
  const generatingCount = Object.values(pageStatuses).filter((s) => s === "generating").length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <Link href="/outline" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Outline
          </Link>
          {illustratedCount > 0 && (
            <Link
              href="/reader"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-extrabold text-accent-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
            >
              <Eye className="h-4 w-4" strokeWidth={2.5} />
              Preview book
            </Link>
          )}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-black md:text-5xl">Illustrations</h1>
            <p className="mt-1 text-muted-foreground">
              {illustratedCount} of {totalCount} pages illustrated
              {book.brief && <span className="ml-2 font-semibold text-foreground">· {book.brief.title}</span>}
            </p>
            {totalCount > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 w-48 overflow-hidden rounded-full bg-muted chunky-border">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${(illustratedCount / totalCount) * 100}%` }}
                  />
                </div>
                {lastSaved && (
                  <span className="text-xs font-bold text-muted-foreground">
                    Saved {lastSaved}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Global timer */}
          {(isRunning || timer.elapsed > 0) && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-2.5 chunky-border">
                <Clock className={`h-4 w-4 ${isRunning ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                <span className="font-display text-xl font-black tabular-nums">{timer.formatted}</span>
              </div>
              {isRunning && generatingCount > 0 && (
                <span className="text-xs font-bold text-muted-foreground">{generatingCount} in progress</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
        {/* Mode */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Mode</span>
          <div className="flex rounded-xl overflow-hidden chunky-border">
            {(["one-by-one", "all"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={isRunning}
                className={`px-3 py-1.5 text-xs font-extrabold transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary"
                }`}
              >
                {m === "one-by-one" ? (
                  <span className="flex items-center gap-1"><SkipForward className="h-3.5 w-3.5" strokeWidth={2.5} /> One by one</span>
                ) : (
                  <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} /> All pages</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Concurrency (only relevant for "all" mode) */}
        {mode === "all" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Concurrency</span>
            <div className="flex rounded-xl overflow-hidden chunky-border">
              {(["sync", "async"] as Concurrency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setConcurrency(c)}
                  disabled={isRunning}
                  className={`px-3 py-1.5 text-xs font-extrabold transition-colors ${
                    concurrency === c ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary"
                  }`}
                >
                  {c === "sync" ? (
                    <span className="flex items-center gap-1"><Play className="h-3.5 w-3.5" strokeWidth={2.5} /> Sequential</span>
                  ) : (
                    <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" strokeWidth={2.5} /> Parallel</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ml-auto flex gap-2">
          {isRunning ? (
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-extrabold text-white chunky-border"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleGenerateAll}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
            >
              <Sparkles className="h-4 w-4" strokeWidth={3} />
              {mode === "one-by-one" ? "Generate one by one" : concurrency === "sync" ? "Generate all (sequential)" : "Generate all (parallel)"}
            </button>
          )}
        </div>
      </div>

      {/* Page grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {allPages.map((page) => (
          <PageCard
            key={page.id}
            page={page}
            bookId={book.id}
            token={token}
            status={pageStatuses[page.id] ?? "idle"}
            elapsed={pageElapsed[page.id] ?? 0}
            onGenerate={() => handleGenerateSingle(page)}
          />
        ))}
      </div>
    </main>
  );
}
