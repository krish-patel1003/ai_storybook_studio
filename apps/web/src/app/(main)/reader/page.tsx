"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { forwardRef, useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeft, ImageIcon, Volume2, VolumeX, Pause, Play } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { pageImageUrl } from "@/lib/api";
import type { PageOut } from "@/lib/api";
import type { HTMLFlipBookRef, HTMLFlipBookProps } from "react-pageflip";

const HTMLFlipBook = dynamic<HTMLFlipBookProps>(
  () => import("react-pageflip"),
  { ssr: false }
) as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<HTMLFlipBookRef>>;

// ── Authenticated resource hook ───────────────────────────────────────────────

function useAuthBlob(url: string, token: string | null, enabled: boolean) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !token) { setBlobUrl(null); return; }
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
  }, [url, token, enabled]);

  return blobUrl;
}

// ── Single book page ──────────────────────────────────────────────────────────

const BookPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null }
>(({ page, bookId, token }, ref) => {
  const imgUrl = useAuthBlob(pageImageUrl(bookId, page.id), token, page.has_image);

  return (
    <div ref={ref} className="relative overflow-hidden bg-card select-none" style={{ height: "100%" }}>
      <div className="absolute inset-x-0 top-0 overflow-hidden bg-muted" style={{ height: "68%" }}>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={page.is_cover ? "Cover" : `Page ${page.order}`}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-12 w-12 opacity-20" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 overflow-hidden border-t-[2.5px] border-foreground bg-card px-4 py-3" style={{ height: "32%" }}>
        {page.is_cover ? (
          <h2 className="text-center font-display text-lg font-black leading-tight overflow-hidden">
            {page.text ?? ""}
          </h2>
        ) : (
          <p className="font-sans text-sm leading-relaxed overflow-hidden">
            {page.text ?? <span className="italic text-muted-foreground">No text yet</span>}
          </p>
        )}
      </div>
    </div>
  );
});
BookPage.displayName = "BookPage";

// ── Back cover ────────────────────────────────────────────────────────────────

const BackCover = forwardRef<HTMLDivElement, { title: string }>(({ title }, ref) => (
  <div ref={ref} className="flex flex-col items-center justify-between overflow-hidden bg-primary select-none p-8">
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
      <div className="font-display text-6xl font-black text-primary-foreground/20 leading-none">✦</div>
      <p className="font-display text-2xl font-black text-primary-foreground tracking-wide">The End</p>
      <p className="text-sm font-bold text-primary-foreground/60 max-w-[180px] leading-relaxed">{title}</p>
    </div>
    <p className="text-xs font-bold text-primary-foreground/30 tracking-widest uppercase">AI Storybook Studio</p>
  </div>
));
BackCover.displayName = "BackCover";

// ── Audio player hook ─────────────────────────────────────────────────────────
//
// Playback sequence per spread:
//   1. Left page (currentPage) audio plays automatically when blob is ready.
//   2. When left ends → play right page (currentPage + 1) if it has audio.
//   3. When right ends (or no right audio) → auto-flip to next page after 1s.
//
// Uses a single stable "ended" listener that reads live context via a ref
// to avoid stale-closure issues.

function usePageAudio(
  pages: PageOut[],
  currentPage: number,
  bookId: string,
  token: string | null,
  bookRef: React.RefObject<HTMLFlipBookRef>,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const cache = useRef<Map<string, string>>(new Map());
  const [cacheVersion, setCacheVersion] = useState(0);

  // Live context for the stable "ended" callback — updated every render.
  const ctx = useRef({ currentPage, pages, muted, playingRight: false });
  ctx.current.currentPage = currentPage;
  ctx.current.pages = pages;
  ctx.current.muted = muted;

  const currentPageData = pages[currentPage] ?? null;
  const hasAudio = !!currentPageData?.has_audio;

  // Pre-fetch current spread + one spread ahead (4 pages).
  useEffect(() => {
    if (!token || !bookId) return;
    const candidates = [
      pages[currentPage],
      pages[currentPage + 1],
      pages[currentPage + 2],
      pages[currentPage + 3],
    ].filter((p): p is PageOut => !!p?.has_audio && !cache.current.has(p.id));

    for (const page of candidates) {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/books/${bookId}/pages/${page.id}/audio`;
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob) {
            cache.current.set(page.id, URL.createObjectURL(blob));
            setCacheVersion((v) => v + 1);
          }
        })
        .catch(() => {});
    }
  }, [currentPage, pages, bookId, token]);

  // Play left-page audio as soon as its blob is ready.
  // Resets playingRight so the "ended" handler knows we're starting fresh.
  useEffect(() => {
    const audio = audioRef.current;
    ctx.current.playingRight = false;

    if (!audio || !currentPageData?.has_audio) {
      audio?.pause();
      setPlaying(false);
      return;
    }
    const blobUrl = cache.current.get(currentPageData.id);
    if (!blobUrl) { setPlaying(false); return; }

    if (audio.src !== blobUrl) { audio.src = blobUrl; audio.load(); }
    if (!muted) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentPageData?.id, cacheVersion]);

  // Single stable "ended" listener — handles left→right→flip sequence.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const doFlip = () => {
      ctx.current.playingRight = false;
      setTimeout(() => bookRef.current?.pageFlip().flipNext(), 1000);
    };

    const onEnded = () => {
      setPlaying(false);
      if (ctx.current.muted) { ctx.current.playingRight = false; return; }

      if (!ctx.current.playingRight) {
        // Left page just ended — try playing right-side page.
        const rightPage = ctx.current.pages[ctx.current.currentPage + 1];
        if (rightPage?.has_audio) {
          const blobUrl = cache.current.get(rightPage.id);
          if (blobUrl) {
            ctx.current.playingRight = true;
            audio.src = blobUrl;
            audio.load();
            audio.play()
              .then(() => setPlaying(true))
              .catch(() => doFlip());
            return;
          }
          // Blob not cached yet — skip right audio and flip.
        }
        doFlip();
      } else {
        // Right page just ended — auto-flip.
        doFlip();
      }
    };

    const onPause = () => setPlaying(false);
    const onPlay  = () => setPlaying(true);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play",  onPlay);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play",  onPlay);
    };
  }, []); // intentionally empty — all state read via ctx ref

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (audioRef.current) audioRef.current.muted = !m;
      return !m;
    });
  }, []);

  return { audioRef, playing, muted, hasAudio, togglePlay, toggleMute };
}

// ── Reader ────────────────────────────────────────────────────────────────────

export default function ReaderPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { book } = useBook();
  const bookRef = useRef<HTMLFlipBookRef>(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (book === null) router.replace("/library");
  }, [book, router]);

  const pages = book ? [...book.pages].sort((a, b) => a.order - b.order) : [];
  const totalPages = pages.length + 1; // +1 for back cover

  // All hooks before early return.
  const { audioRef, playing, muted, hasAudio, togglePlay, toggleMute } =
    usePageAudio(pages, currentPage, book?.id ?? "", token, bookRef);

  const bookHasAnyAudio = pages.some((p) => p.has_audio);

  if (!book) return null;

  function goNext() { bookRef.current?.pageFlip().flipNext(); }
  function goPrev() { bookRef.current?.pageFlip().flipPrev(); }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col bg-background overflow-hidden">
      <audio ref={audioRef} />

      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between border-b-[2px] border-foreground/20 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            href="/editor"
            className="rounded-full bg-card p-2 chunky-border transition-transform hover:-translate-y-0.5"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={3} />
          </Link>
          <span className="font-display text-base font-black md:text-lg">
            {book.brief?.title ?? book.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {bookHasAnyAudio && (
            <button
              onClick={toggleMute}
              title={muted ? "Unmute narration" : "Mute narration"}
              className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border transition-transform hover:-translate-y-0.5"
            >
              {muted
                ? <VolumeX className="h-4 w-4" strokeWidth={2.5} />
                : <Volume2 className="h-4 w-4" strokeWidth={2.5} />}
            </button>
          )}
          <span className="text-sm font-bold text-muted-foreground">
            {currentPage === 0 ? "Cover"
              : currentPage === totalPages - 1 ? "The End"
              : `Page ${currentPage} of ${totalPages - 2}`}
          </span>
        </div>
      </div>

      {/* Flip book */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-6">
        <HTMLFlipBook
          ref={bookRef}
          width={440}
          height={580}
          size="stretch"
          minWidth={260}
          maxWidth={520}
          minHeight={320}
          maxHeight={680}
          showCover
          drawShadow
          flippingTime={850}
          useMouseEvents
          swipeDistance={30}
          showPageCorners
          className="book-shadow"
          onFlip={(e: { data: number }) => setCurrentPage(e.data)}
        >
          {pages.map((page) => (
            <BookPage key={page.id} page={page} bookId={book.id} token={token} />
          ))}
          <BackCover title={book.brief?.title ?? book.title} />
        </HTMLFlipBook>
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t-[2.5px] border-foreground bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={goPrev}
            disabled={currentPage === 0}
            className="grid h-11 w-11 place-items-center rounded-full bg-background chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          >
            <ChevronLeft strokeWidth={3} />
          </button>

          <div className="flex items-center gap-3">
            {hasAudio && !muted && (
              <button
                onClick={togglePlay}
                className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
              >
                {playing
                  ? <Pause className="h-4 w-4" strokeWidth={3} />
                  : <Play  className="h-4 w-4" strokeWidth={3} />}
              </button>
            )}

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => bookRef.current?.pageFlip().flip(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === currentPage
                      ? "w-6 bg-primary"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            onClick={goNext}
            disabled={currentPage >= totalPages - 1}
            className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          >
            <ChevronRight strokeWidth={3} />
          </button>
        </div>
      </div>
    </main>
  );
}
