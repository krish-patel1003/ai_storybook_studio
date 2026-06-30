"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import React, { forwardRef, useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeft, ImageIcon, Volume2, VolumeX, Pause, Play, Type, BookOpen, Download } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, pageImageUrl } from "@/lib/api";
import type { PageOut } from "@/lib/api";
import { toast } from "sonner";
import { READER_FONTS, type FontId } from "@/lib/fonts";
import { useAuthImage } from "@/lib/use-auth-image";
import type { HTMLFlipBookRef, HTMLFlipBookProps } from "react-pageflip";

const HTMLFlipBook = dynamic<HTMLFlipBookProps>(
  () => import("react-pageflip"),
  { ssr: false }
) as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<HTMLFlipBookRef>>;

// ── Font size options ─────────────────────────────────────────────────────────

const FONT_SIZES = [
  { id: "s",  label: "S",  rem: 1.35 },
  { id: "m",  label: "M",  rem: 1.55 },
  { id: "l",  label: "L",  rem: 1.8  },
  { id: "xl", label: "XL", rem: 2.1  },
] as const;

type FontSizeId = typeof FONT_SIZES[number]["id"];

function useReaderFontSize(): [FontSizeId, (s: FontSizeId) => void] {
  const STORAGE_KEY = "reader-fontsize-v1";
  const [size, setSizeState] = useState<FontSizeId>("l");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as FontSizeId | null;
    if (saved && FONT_SIZES.find((s) => s.id === saved)) setSizeState(saved);
  }, []);
  const setSize = useCallback((s: FontSizeId) => {
    setSizeState(s);
    localStorage.setItem(STORAGE_KEY, s);
  }, []);
  return [size, setSize];
}

// ── Font options (shared from @/lib/fonts) ────────────────────────────────────

const FONTS = READER_FONTS;

function useReaderFont(): [FontId, (f: FontId) => void] {
  // v3 key — forces Unkempt as default, ignores old "patrick-hand" saved preference
  const STORAGE_KEY = "reader-font-v3";
  const [font, setFontState] = useState<FontId>("unkempt");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as FontId | null;
    if (saved && FONTS.find((f) => f.id === saved)) setFontState(saved);
  }, []);
  const setFont = useCallback((f: FontId) => {
    setFontState(f);
    localStorage.setItem(STORAGE_KEY, f);
  }, [STORAGE_KEY]);
  return [font, setFont];
}

// ── Cover page — full-bleed image with title + author overlay ─────────────────

const CoverPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null; author: string; fontStack: string }
>(({ page, bookId, token, author, fontStack }, ref) => {
  const imgUrl = useAuthImage(pageImageUrl(bookId, page.id), token, page.has_image);

  return (
    <div ref={ref} className="relative overflow-hidden select-none bg-foreground" style={{ height: "100%" }}>
      {/* Full-bleed illustration */}
      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
        <ImageIcon className="h-16 w-16 opacity-20 text-white" strokeWidth={1.5} />
      </div>
      {imgUrl && (
        <img
          src={imgUrl}
          alt="Cover"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          draggable={false}
        />
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
            fontFamily: 'var(--font-kranky), serif',
            fontWeight: 400,
            fontSize: "clamp(1.5rem, 5vw, 2.4rem)",
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
  { page: PageOut; bookId: string; token: string | null; fontStack: string; fontSize: number; fontWeight: number }
>(({ page, bookId, token, fontStack, fontSize, fontWeight }, ref) => {
  const imgUrl = useAuthImage(pageImageUrl(bookId, page.id), token, page.has_image);
  const textRef = useRef<HTMLParagraphElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Per-page style overrides saved from studio take precedence over reader-level controls
  const pageFont = page.font_family ? FONTS.find(f => f.id === page.font_family) : null;
  const effectiveFontStack  = pageFont?.stack  ?? fontStack;
  const effectiveFontWeight = pageFont?.weight ?? fontWeight;
  // page.font_size is in px; convert to rem for the reader's sizing system
  const effectiveFontSize   = page.font_size ? page.font_size / 16 : fontSize;
  const effectiveTextColor  = page.text_color ?? undefined;

  // Auto-shrink font if text overflows the container.
  useEffect(() => {
    const el = textRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const fit = () => {
      if (!page.text || container.clientHeight === 0) return;
      el.style.fontSize = `${effectiveFontSize}rem`;
      let px = effectiveFontSize * 16;
      const minPx = 9;
      while (el.scrollHeight > container.clientHeight && px > minPx) {
        px -= 0.5;
        el.style.fontSize = `${px}px`;
      }
      el.style.overflow = el.scrollHeight > container.clientHeight ? "hidden" : "";
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [page.text, effectiveFontStack, effectiveFontSize]);

  const textZone     = "38%";
  const gradientZone = "47%";
  const tPos   = page.text_position ?? "bottom";
  const tAlign = (page.text_align ?? "center") as React.CSSProperties["textAlign"];
  const isStacked = page.text_mode === 2;
  const isTextBottom = tPos !== "top";

  // ── Stacked layout (Mode 2): image block + text block ──────────────────────
  if (isStacked) {
    return (
      <div ref={ref} className="relative overflow-hidden select-none"
        style={{ height: "100%", background: "#faf8f3", display: "flex", flexDirection: isTextBottom ? "column" : "column-reverse" }}>
        {/* Image block — 55% (only when an image is available) */}
        {imgUrl && (
          <div className="relative" style={{ flex: "0 0 55%" }}>
            <img src={imgUrl} alt={`Page ${page.order}`}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
              style={{ objectPosition: "center top" }} draggable={false} />
            {/* Gradient blend into text block */}
            <div style={{
              position: "absolute", [isTextBottom ? "bottom" : "top"]: 0, left: 0, right: 0, height: "40%",
              background: isTextBottom
                ? "linear-gradient(to bottom, transparent, #faf8f3)"
                : "linear-gradient(to top, transparent, #faf8f3)",
            }} />
          </div>
        )}
        {/* Text block */}
        <div ref={containerRef}
          style={{ flex: imgUrl ? 1 : undefined, flexGrow: imgUrl ? undefined : 1, minHeight: 0, background: "#faf8f3", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isTextBottom ? "16px 56px 28px 56px" : "28px 56px 16px 56px", overflow: "hidden" }}>
          {page.text ? (
            <p ref={textRef} className="w-full"
              style={{ fontFamily: effectiveFontStack, fontSize: `${effectiveFontSize}rem`, fontWeight: effectiveFontWeight, lineHeight: 1.85, textAlign: tAlign, ...(effectiveTextColor ? { color: effectiveTextColor } : { color: "#1a1a2e" }) }}>
              {page.text}
            </p>
          ) : (
            <p className="italic text-muted-foreground text-sm" style={{ fontFamily: effectiveFontStack }}>No text yet</p>
          )}
        </div>
        <div className="absolute bottom-1.5 right-3 text-[10px] font-bold text-foreground/30 select-none">{page.order}</div>
      </div>
    );
  }

  // ── Overlay layout (Mode 1, default) ────────────────────────────────────────
  return (
    <div ref={ref} className="relative overflow-hidden select-none" style={{ height: "100%", background: "#faf8f3" }}>
      {/* Full-bleed illustration — placeholder always rendered, image fades in over it */}
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        <ImageIcon className="h-12 w-12 opacity-20" strokeWidth={1.5} />
      </div>
      {imgUrl && (
        <img
          src={imgUrl}
          alt={`Page ${page.order}`}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          style={{ objectPosition: "center top" }}
          draggable={false}
        />
      )}

      {/* Gradient blending layer — direction follows text position */}
      {(() => {
        const gradStyle: React.CSSProperties =
          tPos === "top"    ? { top: 0, bottom: "auto", background: "linear-gradient(to top, transparent 0%, transparent 22%, rgba(250,248,243,0.30) 42%, rgba(250,248,243,0.78) 62%, rgba(250,248,243,0.96) 78%, #faf8f3 90%)" } :
          tPos === "center" ? { top: "26%", bottom: "26%", background: "radial-gradient(ellipse at center, rgba(250,248,243,0.90) 30%, transparent 90%)" } :
          { bottom: 0, top: "auto", background: "linear-gradient(to bottom, transparent 0%, transparent 22%, rgba(250,248,243,0.30) 42%, rgba(250,248,243,0.78) 62%, rgba(250,248,243,0.96) 78%, #faf8f3 90%)" };
        return (
          <div
            className="absolute inset-x-0 pointer-events-none"
            style={{ height: gradientZone, ...gradStyle }}
          />
        );
      })()}

      {/* Text area — position follows page.text_position */}
      {(() => {
        const posStyle: React.CSSProperties =
          tPos === "top"    ? { top: 0, bottom: "auto" } :
          tPos === "center" ? { top: "31%", bottom: "31%" } :
          { bottom: 0, top: "auto" };
        const justifyClass =
          tPos === "top"    ? "justify-start" :
          tPos === "center" ? "justify-center" :
          "justify-end";
        return (
          <div
            ref={containerRef}
            className={`absolute inset-x-0 flex flex-col items-center ${justifyClass} overflow-hidden`}
            style={{ height: textZone, padding: "8px 40px 24px 40px", ...posStyle }}
          >
            {page.text ? (
              <p
                ref={textRef}
                className="text-foreground w-full"
                style={{ fontFamily: effectiveFontStack, fontSize: `${effectiveFontSize}rem`, fontWeight: effectiveFontWeight, lineHeight: 1.85, textAlign: tAlign, ...(effectiveTextColor ? { color: effectiveTextColor } : {}) }}
              >
                {page.text}
              </p>
            ) : (
              <p className="italic text-muted-foreground text-sm" style={{ fontFamily: effectiveFontStack }}>
                No text yet
              </p>
            )}
          </div>
        );
      })()}

      {/* Chapter label — top right, from narrative role */}
      {page.narrative_role && (
        <div className="absolute top-3 right-3 select-none pointer-events-none max-w-[55%] text-right">
          <span
            style={{
              fontFamily: effectiveFontStack,
              fontSize: "0.6rem",
              fontWeight: 400,
              letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.72)",
              textShadow: "0 1px 4px rgba(0,0,0,0.55)",
              lineHeight: 1.3,
            }}
          >
            {page.narrative_role}
          </span>
        </div>
      )}

      {/* Page number — subtle, bottom right */}
      <div className="absolute bottom-1.5 right-3 text-[10px] font-bold text-foreground/30 select-none">
        {page.order}
      </div>
    </div>
  );
});
StoryPage.displayName = "StoryPage";

// ── Back cover ────────────────────────────────────────────────────────────────

const BackCoverPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null; title: string }
>(({ page, bookId, token, title }, ref) => {
  const imgUrl = useAuthImage(pageImageUrl(bookId, page.id), token, page.has_image);
  return (
    <div ref={ref} className="relative overflow-hidden select-none" style={{ height: "100%", background: "#1a1a2e" }}>
      {imgUrl && (
        <img
          src={imgUrl}
          alt="Back cover"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
      {/* Dark overlay so text is legible over any illustration */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(10,10,20,0.88) 0%, rgba(10,10,20,0.45) 50%, transparent 100%)" }} />
      {/* "The End" text */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-10 text-center">
        <p className="font-display text-2xl font-black text-white tracking-wide" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>The End</p>
        <p className="text-xs font-bold text-white/60 max-w-[160px] leading-relaxed" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{title}</p>
      </div>
      <p className="absolute bottom-2 right-3 text-[10px] font-bold text-white/20 tracking-widest uppercase select-none">AI Storybook Studio</p>
    </div>
  );
});
BackCoverPage.displayName = "BackCoverPage";

// ── Font picker popover ───────────────────────────────────────────────────────

function FontPicker({ font, setFont }: { font: FontId; setFont: (f: FontId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeFont = FONTS.find((f) => f.id === font) ?? FONTS[0];

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
        <span style={{ fontFamily: activeFont.stack, fontWeight: activeFont.weight }}>
          {activeFont.label}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-card p-2 chunky-border chunky-shadow z-50">
          <p className="px-2 pb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Story font
          </p>
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => { setFont(f.id); setOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                font === f.id ? "bg-primary text-primary-foreground" : "hover:bg-accent/40"
              }`}
            >
              <span
                className="text-xl w-8 shrink-0 text-center"
                style={{ fontFamily: f.stack, fontWeight: f.weight, lineHeight: 1 }}
              >
                Aa
              </span>
              <span
                className="text-sm leading-tight"
                style={{ fontFamily: f.stack, fontWeight: f.weight }}
              >
                {f.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Font size picker ──────────────────────────────────────────────────────────

function FontSizePicker({ size, setSize }: { size: FontSizeId; setSize: (s: FontSizeId) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-card px-1.5 h-8 chunky-border">
      {FONT_SIZES.map((s) => (
        <button
          key={s.id}
          onClick={() => setSize(s.id)}
          title={`Font size ${s.label}`}
          className={`h-6 w-7 rounded-full text-xs font-extrabold transition-all ${
            size === s.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-highlight"
          }`}
        >
          {s.label}
        </button>
      ))}
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
  bookRef: React.RefObject<HTMLFlipBookRef | null>,
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

    // Guard: when the prefetcher caches upcoming pages, cacheVersion increments.
    // Don't interrupt right-page audio that's already playing — the onEnded
    // handler will call doFlip() when it's done. Only reset on a real page change.
    if (ctx.current.playingRight) return;

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

  // Cover page has no right-page partner (showCover renders it alone).
  // If cover has no audio the onEnded chain never fires — flip after a short pause.
  useEffect(() => {
    if (currentPage !== 0 || currentPageData?.has_audio) return;
    const t = setTimeout(() => bookRef.current?.pageFlip().flipNext(), 1800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentPageData?.has_audio]);

  // Single stable "ended" listener — handles left→right→flip sequence.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const doFlip = () => {
      setTimeout(() => {
        ctx.current.playingRight = false;
        bookRef.current?.pageFlip().flipNext();
      }, 800);
    };

    const onEnded = () => {
      setPlaying(false);
      if (ctx.current.muted) { ctx.current.playingRight = false; return; }

      if (!ctx.current.playingRight) {
        // Cover page is shown alone (showCover=true) — no right-page partner.
        // Flip directly instead of playing the next page's audio prematurely.
        if (ctx.current.currentPage === 0) { doFlip(); return; }

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

import { Suspense } from "react";

function ReaderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user } = useAuth();
  const { book } = useBook();

  // Resolve where the back button should go
  const fromParam = searchParams.get("from");
  const validFrom = fromParam === "editor" || fromParam === "library" || fromParam === "studio";
  const backHref = fromParam === "editor" ? "/editor" : fromParam === "studio" ? "/studio" : "/library";
  const backLabel = fromParam === "editor" ? "Editor" : fromParam === "studio" ? "Studio" : "Library";
  const bookRef = useRef<HTMLFlipBookRef>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [font, setFont] = useReaderFont();
  const [fontSizeId, setFontSizeId] = useReaderFontSize();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (book === null) router.replace("/library");
  }, [book, router]);

  const pages = book ? [...book.pages].sort((a, b) => a.order - b.order) : [];
  const totalPages = pages.length;

  const { audioRef, playing, muted, hasAudio, togglePlay, toggleMute } =
    usePageAudio(pages, currentPage, book?.id ?? "", token, bookRef);

  const bookHasAnyAudio = pages.some((p) => p.has_audio);
  const activeFont = FONTS.find((f) => f.id === font) ?? FONTS[0];
  const fontStack  = activeFont.stack;
  const fontWeight = activeFont.weight;
  const fontSize   = FONT_SIZES.find((s) => s.id === fontSizeId)?.rem ?? 1.8;
  const penName = book?.author_name || user?.username || "";

  // Opened directly (not via editor Preview or library) → show empty state
  if (!validFrom || !book) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-card chunky-border chunky-shadow">
          <BookOpen className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="font-display text-3xl font-black">No book selected</h1>
          <p className="mt-2 text-muted-foreground">Head to your library to pick a book to read.</p>
        </div>
        <Link
          href="/library"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
        >
          Go to Library
        </Link>
      </main>
    );
  }

  async function handleExport() {
    if (!token || !book) return;
    setExporting(true);
    try {
      const res = await api.books.exportPdf(token, book.id, font);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(book.brief?.title ?? book.title).replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function goNext() { bookRef.current?.pageFlip().flipNext(); }
  function goPrev() { bookRef.current?.pageFlip().flipPrev(); }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col bg-background overflow-hidden">
      <audio ref={audioRef} />

      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between border-b-[2px] border-foreground/20 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-extrabold chunky-border transition-transform hover:-translate-y-0.5"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={3} />
            {backLabel}
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
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Download PDF"
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-extrabold chunky-border transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
            {exporting ? "Exporting…" : "PDF"}
          </button>
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
            ) : page.is_back_cover ? (
              <BackCoverPage key={page.id} page={page} bookId={book.id} token={token} title={book.brief?.title ?? book.title} />
            ) : (
              <StoryPage key={page.id} page={page} bookId={book.id} token={token} fontStack={fontStack} fontSize={fontSize} fontWeight={fontWeight} />
            )
          )}
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

export default function ReaderPage() {
  return (
    <Suspense>
      <ReaderInner />
    </Suspense>
  );
}
