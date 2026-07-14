"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import React, { forwardRef, useRef, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ImageIcon, BookOpen } from "lucide-react";
import { LgSpinner } from "@/components/character-spinner";
import { api, publicPageImageUrl, type BookOut, type PageOut } from "@/lib/api";
import type { HTMLFlipBookRef, HTMLFlipBookProps } from "react-pageflip";

const HTMLFlipBook = dynamic<HTMLFlipBookProps>(
  () => import("react-pageflip"),
  { ssr: false }
) as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<HTMLFlipBookRef>>;

const BG = "#faf8f3";

// ── Single book page — immersive style, mirrors the signed-in reader ─────────

const BookPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; author: string; title: string }
>(({ page, bookId, author, title }, ref) => {
  const textRef = useRef<HTMLParagraphElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const imgUrl = page.has_image ? publicPageImageUrl(bookId, page.id) : null;

  useEffect(() => {
    const el = textRef.current;
    const zone = zoneRef.current;
    if (!el || !zone || !page.text) return;
    const fit = () => {
      if (zone.clientHeight === 0) return;
      el.style.fontSize = "";
      let px = 15;
      const minPx = 9;
      while (el.scrollHeight > zone.clientHeight && px > minPx) {
        px -= 0.5;
        el.style.fontSize = `${px}px`;
      }
      el.style.overflow = el.scrollHeight > zone.clientHeight ? "hidden" : "";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(zone);
    return () => ro.disconnect();
  }, [page.text]);

  // ── Front cover — full-bleed image + title/author overlay ──
  if (page.is_cover) {
    return (
      <div ref={ref} className="relative overflow-hidden select-none bg-foreground" style={{ height: "100%" }}>
        <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
          <ImageIcon className="h-16 w-16 opacity-20 text-white" strokeWidth={1.5} />
        </div>
        {imgUrl && <img src={imgUrl} alt="Cover" className="absolute inset-0 h-full w-full object-cover" draggable={false} />}
        <div className="absolute inset-x-0 bottom-0" style={{ height: "55%", background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,20,0.55) 40%, rgba(10,10,20,0.88) 100%)" }} />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-8 px-6 text-center">
          <h1 className="text-white leading-tight" style={{ fontFamily: "var(--font-kranky), serif", fontWeight: 400, fontSize: "clamp(1.4rem, 5vw, 2.2rem)", textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>{page.text ?? ""}</h1>
          {author && <p className="mt-2 text-white/75" style={{ fontSize: "clamp(0.75rem, 2vw, 0.95rem)", textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>by {author}</p>}
        </div>
      </div>
    );
  }

  // ── Back cover — full-bleed image + "The End" overlay ──
  if (page.is_back_cover) {
    return (
      <div ref={ref} className="relative overflow-hidden select-none" style={{ height: "100%", background: "#1a1a2e" }}>
        {imgUrl && <img src={imgUrl} alt="Back cover" className="absolute inset-0 h-full w-full object-cover" draggable={false} />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(10,10,20,0.88) 0%, rgba(10,10,20,0.45) 50%, transparent 100%)" }} />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-10 text-center">
          <p className="font-display text-2xl font-black text-white tracking-wide" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>The End</p>
          <p className="text-xs font-bold text-white/60 max-w-[160px] leading-relaxed" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{title}</p>
        </div>
        <p className="absolute bottom-2 right-3 text-[10px] font-bold text-white/20 tracking-widest uppercase select-none">AI Storybook Studio</p>
      </div>
    );
  }

  // ── Story page — image top 72% + gradient fade + text bottom 28% ──
  const isTextBottom = (page.text_position ?? "bottom") !== "top";
  const textAlign = (page.text_align ?? "center") as React.CSSProperties["textAlign"];
  const TEXT_PCT = "28%";
  return (
    <div ref={ref} className="relative overflow-hidden select-none" style={{ height: "100%", background: BG }}>
      <div style={{ position: "absolute", top: isTextBottom ? 0 : TEXT_PCT, bottom: isTextBottom ? TEXT_PCT : 0, left: 0, right: 0, overflow: "hidden" }}>
        {imgUrl ? (
          <img src={imgUrl} alt={`Page ${page.order}`} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "center top" }} draggable={false} />
        ) : (
          <div className="absolute inset-0 bg-muted flex items-center justify-center"><ImageIcon className="h-12 w-12 text-muted-foreground/20" strokeWidth={1} /></div>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, height: "45%", [isTextBottom ? "bottom" : "top"]: 0, background: isTextBottom ? `linear-gradient(to bottom, transparent, ${BG})` : `linear-gradient(to top, transparent, ${BG})` }} />
      </div>
      <div ref={zoneRef} style={{ position: "absolute", top: isTextBottom ? "72%" : 0, bottom: isTextBottom ? 0 : "72%", left: 0, right: 0, background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 22px", overflow: "hidden" }}>
        <p ref={textRef} className="font-display leading-relaxed" style={{ textAlign, fontSize: "15px", color: "var(--foreground)" }}>
          {page.text ?? <span className="italic text-muted-foreground">No text yet</span>}
        </p>
      </div>
    </div>
  );
});
BookPage.displayName = "BookPage";

// ── Fallback back cover (only when the book has no back-cover page) ───────────

const BackCoverFallback = forwardRef<HTMLDivElement, { title: string }>(({ title }, ref) => (
  <div ref={ref} className="flex flex-col items-center justify-between overflow-hidden bg-primary select-none p-8">
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
      <div className="font-display text-6xl font-black text-primary-foreground/20 leading-none">✦</div>
      <p className="font-display text-2xl font-black text-primary-foreground tracking-wide">The End</p>
      <p className="text-sm font-bold text-primary-foreground/60 max-w-[180px] leading-relaxed">{title}</p>
    </div>
    <p className="text-xs font-bold text-primary-foreground/30 tracking-widest uppercase">AI Storybook Studio</p>
  </div>
));
BackCoverFallback.displayName = "BackCoverFallback";

// ── Not found state ───────────────────────────────────────────────────────────

function BookNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-32 text-center px-4">
      <div className="grid h-24 w-24 place-items-center rounded-3xl bg-muted chunky-border">
        <BookOpen className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="font-display text-2xl font-black">Book not found</h2>
        <p className="mt-1 text-muted-foreground">This book doesn&apos;t exist or isn&apos;t public.</p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
      >
        View on AI Storybook Studio
      </Link>
    </div>
  );
}

// ── Public reader ─────────────────────────────────────────────────────────────

export default function PublicReaderPage() {
  const params = useParams();
  const bookId = params.bookId as string;

  const [book, setBook] = useState<BookOut | null | "not_found">(null);
  const bookRef = useRef<HTMLFlipBookRef>(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (!bookId) return;
    api.books.getPublicBook(bookId)
      .then((b) => setBook(b))
      .catch(() => setBook("not_found"));
  }, [bookId]);

  if (book === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LgSpinner />
      </div>
    );
  }

  if (book === "not_found") {
    return (
      <main className="min-h-screen bg-background">
        <BookNotFound />
      </main>
    );
  }

  const pages = [...book.pages].sort((a, b) => a.order - b.order);
  const hasBackCover = pages.some((p) => p.is_back_cover);
  const totalPages = pages.length + (hasBackCover ? 0 : 1); // +1 only if no back-cover page
  const title = book.brief?.title ?? book.title;
  const author = book.author_name ?? "";

  function goNext() { bookRef.current?.pageFlip().flipNext(); }
  function goPrev() { bookRef.current?.pageFlip().flipPrev(); }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col bg-background overflow-hidden">
      {/* Book title strip */}
      <div className="flex shrink-0 items-center justify-center border-b-[2px] border-foreground/20 px-5 py-2">
        <span className="font-display text-base font-black md:text-lg">{title}</span>
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
          {[
            ...pages.map((page) => (
              <BookPage key={page.id} page={page} bookId={bookId} author={author} title={title} />
            )),
            ...(hasBackCover ? [] : [<BackCoverFallback key="__backcover" title={title} />]),
          ]}
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

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-muted-foreground">
              {currentPage === 0 ? "Cover"
                : currentPage === totalPages - 1 ? "The End"
                : `Page ${currentPage} of ${totalPages - 2}`}
            </span>
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
