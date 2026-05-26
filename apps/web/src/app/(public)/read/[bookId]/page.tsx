"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { forwardRef, useRef, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ImageIcon, BookOpen } from "lucide-react";
import { api, publicPageImageUrl, type BookOut, type PageOut } from "@/lib/api";
import type { HTMLFlipBookRef, HTMLFlipBookProps } from "react-pageflip";

const HTMLFlipBook = dynamic<HTMLFlipBookProps>(
  () => import("react-pageflip"),
  { ssr: false }
) as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<HTMLFlipBookRef>>;

// ── Single book page (must use forwardRef for react-pageflip) ────────────────

const BookPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string }
>(({ page, bookId }, ref) => {
  return (
    <div ref={ref} className="relative overflow-hidden bg-card select-none" style={{ height: "100%" }}>
      {/* Illustration — top 68% */}
      <div className="absolute inset-x-0 top-0 overflow-hidden bg-muted" style={{ height: "68%" }}>
        {page.has_image ? (
          <img
            src={publicPageImageUrl(bookId, page.id)}
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

      {/* Text — bottom 32% */}
      <div className="absolute inset-x-0 bottom-0 overflow-hidden border-t-[2.5px] border-foreground bg-card px-4 py-3" style={{ height: "32%" }}>
        {page.is_cover ? (
          <h2 className="text-center font-display text-lg font-black leading-tight overflow-hidden">
            {page.text ?? ""}
          </h2>
        ) : (
          <p className="font-display text-sm leading-relaxed overflow-hidden">
            {page.text ?? <span className="italic text-muted-foreground">No text yet</span>}
          </p>
        )}
      </div>
    </div>
  );
});
BookPage.displayName = "BookPage";

// ── Back cover ───────────────────────────────────────────────────────────────

const BackCover = forwardRef<HTMLDivElement, { title: string }>(({ title }, ref) => (
  <div ref={ref} className="flex flex-col items-center justify-between overflow-hidden bg-primary select-none p-8">
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
      <div className="font-display text-6xl font-black text-primary-foreground/20 leading-none">
        ✦
      </div>
      <p className="font-display text-2xl font-black text-primary-foreground tracking-wide">
        The End
      </p>
      <p className="text-sm font-bold text-primary-foreground/60 max-w-[180px] leading-relaxed">
        {title}
      </p>
    </div>
    <p className="text-xs font-bold text-primary-foreground/30 tracking-widest uppercase">
      AI Storybook Studio
    </p>
  </div>
));
BackCover.displayName = "BackCover";

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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
  const totalPages = pages.length + 1; // +1 for back cover
  const title = book.brief?.title ?? book.title;

  function goNext() { bookRef.current?.pageFlip().flipNext(); }
  function goPrev() { bookRef.current?.pageFlip().flipPrev(); }

  return (
    <main className="flex h-screen flex-col bg-background overflow-hidden">
      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between border-b-[2px] border-foreground/20 px-5 py-2.5">
        <span className="font-display text-base font-black md:text-lg">{title}</span>
        <Link
          href="/"
          className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          View on AI Storybook Studio →
        </Link>
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
            <BookPage key={page.id} page={page} bookId={bookId} />
          ))}
          <BackCover title={title} />
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
