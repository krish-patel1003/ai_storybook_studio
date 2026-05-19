"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { forwardRef, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeft, ImageIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { pageImageUrl } from "@/lib/api";
import type { PageOut } from "@/lib/api";
import type { HTMLFlipBookRef, HTMLFlipBookProps } from "react-pageflip";

const HTMLFlipBook = dynamic<HTMLFlipBookProps>(
  () => import("react-pageflip"),
  { ssr: false }
) as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<HTMLFlipBookRef>>;

// ── Authenticated image hook ──────────────────────────────────────────────────

function useAuthImage(url: string, token: string | null, hasImage: boolean) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasImage || !token) { setBlobUrl(null); return; }
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

// ── Single book page (must use forwardRef for react-pageflip) ────────────────

const BookPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null }
>(({ page, bookId, token }, ref) => {
  const blobUrl = useAuthImage(pageImageUrl(bookId, page.id), token, page.has_image);

  return (
    <div ref={ref} className="flex flex-col overflow-hidden bg-card select-none">
      {/* Illustration */}
      <div className="min-h-0 flex-1 overflow-hidden bg-muted">
        {blobUrl ? (
          <img
            src={blobUrl}
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

      {/* Text */}
      <div className="shrink-0 border-t-[2.5px] border-foreground p-4 md:p-5">
        {page.is_cover ? (
          <h2 className="text-center font-display text-xl font-black md:text-2xl leading-tight">
            {page.text ?? ""}
          </h2>
        ) : (
          <p className="font-display text-sm leading-relaxed md:text-base">
            {page.text ?? <span className="italic text-muted-foreground">No text yet</span>}
          </p>
        )}
      </div>
    </div>
  );
});
BookPage.displayName = "BookPage";

// ── Back cover (last page — makes the book close cleanly) ────────────────────

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

  if (!book) return null;

  const pages = [...book.pages].sort((a, b) => a.order - b.order);
  const totalPages = pages.length + 1; // +1 for back cover

  function goNext() { bookRef.current?.pageFlip().flipNext(); }
  function goPrev() { bookRef.current?.pageFlip().flipPrev(); }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col bg-background">
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
        <span className="text-sm font-bold text-muted-foreground">
          {currentPage === 0 ? "Cover"
            : currentPage === totalPages - 1 ? "The End"
            : `Page ${currentPage} of ${totalPages - 2}`}
        </span>
      </div>

      {/* Flip book */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-4 pb-[72px]">
        <HTMLFlipBook
          ref={bookRef}
          width={440}
          height={580}
          size="stretch"
          minWidth={260}
          maxWidth={560}
          minHeight={340}
          maxHeight={740}
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
      <div className="fixed inset-x-0 bottom-0 border-t-[2.5px] border-foreground bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={goPrev}
            disabled={currentPage === 0}
            className="grid h-11 w-11 place-items-center rounded-full bg-background chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          >
            <ChevronLeft strokeWidth={3} />
          </button>

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
