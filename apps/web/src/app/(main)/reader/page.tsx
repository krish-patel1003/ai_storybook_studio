"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { forwardRef, useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeft, ImageIcon, Volume2, VolumeX, Pause, Play, Type } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { pageImageUrl } from "@/lib/api";
import type { PageOut } from "@/lib/api";
import type { HTMLFlipBookRef, HTMLFlipBookProps } from "react-pageflip";

const HTMLFlipBook = dynamic<HTMLFlipBookProps>(
  () => import("react-pageflip"),
  { ssr: false }
) as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<HTMLFlipBookRef>>;

// ── Font options ──────────────────────────────────────────────────────────────

const FONTS = [
  { id: "nunito",       label: "Nunito",        stack: '"Nunito", sans-serif',        sample: "Aa" },
  { id: "patrick-hand", label: "Patrick Hand",  stack: '"Patrick Hand", cursive',     sample: "Aa" },
  { id: "caveat",       label: "Caveat",         stack: '"Caveat", cursive',           sample: "Aa" },
  { id: "merriweather", label: "Merriweather",   stack: '"Merriweather", serif',       sample: "Aa" },
  { id: "quicksand",    label: "Quicksand",      stack: '"Quicksand", sans-serif',     sample: "Aa" },
] as const;

type FontId = typeof FONTS[number]["id"];

function useReaderFont(): [FontId, (f: FontId) => void] {
  const [font, setFontState] = useState<FontId>("nunito");
  useEffect(() => {
    const saved = localStorage.getItem("reader-font") as FontId | null;
    if (saved && FONTS.find((f) => f.id === saved)) setFontState(saved);
  }, []);
  const setFont = useCallback((f: FontId) => {
    setFontState(f);
    localStorage.setItem("reader-font", f);
  }, []);
  return [font, setFont];
}

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

// ── Cover page — full-bleed image with title + author overlay ─────────────────

const CoverPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null; author: string; fontStack: string }
>(({ page, bookId, token, author, fontStack }, ref) => {
  const imgUrl = useAuthBlob(pageImageUrl(bookId, page.id), token, page.has_image);

  return (
    <div ref={ref} className="relative overflow-hidden select-none bg-foreground" style={{ height: "100%" }}>
      {/* Full-bleed illustration */}
      {imgUrl ? (
        <img
          src={imgUrl}
          alt="Cover"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
          <ImageIcon className="h-16 w-16 opacity-20 text-white" strokeWidth={1.5} />
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "55%",
          background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,20,0.55) 40%, rgba(10,10,20,0.88) 100%)",
        }}
      />

      {/* Title + author */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-8 px-6 text-center">
        <h1
          className="text-white leading-tight drop-shadow-lg"
          style={{
            fontFamily: '"Fredoka", sans-serif',
            fontWeight: 700,
            fontSize: "clamp(1.4rem, 5vw, 2.2rem)",
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {page.text ?? ""}
        </h1>
        {author && (
          <p
            className="mt-2 text-white/75 drop-shadow"
            style={{
              fontFamily: fontStack,
              fontSize: "clamp(0.75rem, 2vw, 0.95rem)",
              textShadow: "0 1px 6px rgba(0,0,0,0.5)",
            }}
          >
            by {author}
          </p>
        )}
      </div>
    </div>
  );
});
CoverPage.displayName = "CoverPage";

// ── Story page — full-bleed image + gradient fade into text ───────────────────

const StoryPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null; fontStack: string }
>(({ page, bookId, token, fontStack }, ref) => {
  const imgUrl = useAuthBlob(pageImageUrl(bookId, page.id), token, page.has_image);
  const textRef = useRef<HTMLParagraphElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-shrink font if text overflows
  useEffect(() => {
    const el = textRef.current;
    const container = containerRef.current;
    if (!el || !container || !page.text) return;
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize);
    const minSize = 8.5;
    while (el.scrollHeight > container.clientHeight && size > minSize) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [page.text, fontStack]);

  // Text zone height — smaller = text starts lower on the page
  const textZone = "30%";

  return (
    <div ref={ref} className="relative overflow-hidden select-none" style={{ height: "100%", background: "#faf8f3" }}>
      {/* Full-bleed illustration — sits behind everything */}
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={`Page ${page.order}`}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <ImageIcon className="h-12 w-12 opacity-20" strokeWidth={1.5} />
        </div>
      )}

      {/* Gradient blending layer — no hard line */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: textZone,
          background: "linear-gradient(to bottom, transparent 0%, rgba(250,248,243,0.82) 35%, rgba(250,248,243,0.97) 60%, #faf8f3 100%)",
        }}
      />

      {/* Text area — sits in the gradient zone */}
      <div
        ref={containerRef}
        className="absolute inset-x-0 bottom-0 overflow-hidden"
        style={{ height: textZone, padding: "14px 18px 14px 18px" }}
      >
        {page.text ? (
          <p
            ref={textRef}
            className="leading-relaxed text-foreground font-bold"
            style={{ fontFamily: fontStack, fontSize: "0.88rem" }}
          >
            {page.text}
          </p>
        ) : (
          <p className="italic text-muted-foreground text-sm" style={{ fontFamily: fontStack }}>
            No text yet
          </p>
        )}
      </div>

      {/* Page number — subtle, bottom right */}
      <div className="absolute bottom-1.5 right-3 text-[10px] font-bold text-foreground/30 select-none">
        {page.order}
      </div>
    </div>
  );
});
StoryPage.displayName = "StoryPage";

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

// ── Font picker popover ───────────────────────────────────────────────────────

function FontPicker({ font, setFont }: { font: FontId; setFont: (f: FontId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Change font"
        className="flex items-center gap-1.5 rounded-full bg-card px-3 h-8 chunky-border transition-transform hover:-translate-y-0.5 text-xs font-extrabold"
      >
        <Type className="h-3.5 w-3.5" strokeWidth={2.5} />
        <span>Font</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-card p-2 chunky-border chunky-shadow z-50">
          <p className="px-2 pb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Story font
          </p>
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => { setFont(f.id); setOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                font === f.id ? "bg-primary text-primary-foreground" : "hover:bg-highlight"
              }`}
            >
              <span className="text-lg w-6 shrink-0" style={{ fontFamily: f.stack }}>{f.sample}</span>
              <span className="text-sm font-bold" style={{ fontFamily: f.stack }}>{f.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
        }
        doFlip();
      } else {
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
  const { token, user } = useAuth();
  const { book } = useBook();
  const bookRef = useRef<HTMLFlipBookRef>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [font, setFont] = useReaderFont();

  useEffect(() => {
    if (book === null) router.replace("/library");
  }, [book, router]);

  const pages = book ? [...book.pages].sort((a, b) => a.order - b.order) : [];
  const totalPages = pages.length + 1; // +1 for back cover

  const { audioRef, playing, muted, hasAudio, togglePlay, toggleMute } =
    usePageAudio(pages, currentPage, book?.id ?? "", token, bookRef);

  const bookHasAnyAudio = pages.some((p) => p.has_audio);
  const fontStack = FONTS.find((f) => f.id === font)?.stack ?? FONTS[0].stack;
  const penName = user?.pen_name ?? "";

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
            href="/library"
            className="rounded-full bg-card p-2 chunky-border transition-transform hover:-translate-y-0.5"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={3} />
          </Link>
          <span className="font-display text-base font-black md:text-lg">
            {book.brief?.title ?? book.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FontPicker font={font} setFont={setFont} />
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
          {pages.map((page) =>
            page.is_cover ? (
              <CoverPage key={page.id} page={page} bookId={book.id} token={token} author={penName} fontStack={fontStack} />
            ) : (
              <StoryPage key={page.id} page={page} bookId={book.id} token={token} fontStack={fontStack} />
            )
          )}
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
