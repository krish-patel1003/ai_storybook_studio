"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { forwardRef, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Volume2, X } from "lucide-react";
import { mockBook } from "@/lib/mock-book";
import type { HTMLFlipBookRef, HTMLFlipBookProps } from "@/types/react-pageflip";

// Must be loaded client-only — page-flip accesses DOM on mount
const HTMLFlipBook = dynamic<HTMLFlipBookProps>(
  () => import("react-pageflip"),
  { ssr: false }
) as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<HTMLFlipBookRef>>;

// Each page must use forwardRef so react-pageflip can inject its DOM ref
const BookPage = forwardRef<HTMLDivElement, { page: (typeof mockBook.pages)[0] }>(
  ({ page }, ref) => (
    <div ref={ref} className="flex flex-col overflow-hidden bg-card">
      <div className="min-h-0 flex-1 overflow-hidden bg-muted">
        <img
          src={page.image}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
      <div className="shrink-0 border-t-[2.5px] border-foreground p-4 md:p-5">
        {page.isCover ? (
          <h2 className="text-center font-display text-2xl font-black md:text-3xl">
            {page.text}
          </h2>
        ) : (
          <p className="font-display text-sm leading-relaxed md:text-base">{page.text}</p>
        )}
      </div>
    </div>
  )
);
BookPage.displayName = "BookPage";

export default function ReaderPage() {
  const bookRef = useRef<HTMLFlipBookRef>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [aloud, setAloud] = useState(false);

  const totalPages = mockBook.pages.length;

  function goNext() {
    bookRef.current?.pageFlip().flipNext();
  }

  function goPrev() {
    bookRef.current?.pageFlip().flipPrev();
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      {/* Slim title bar */}
      <div className="flex shrink-0 items-center justify-between border-b-[2px] border-foreground/20 px-5 py-2.5">
        <div className="font-display text-base font-black md:text-lg">{mockBook.title}</div>
        <Link
          href="/editor"
          className="rounded-full bg-card p-2 chunky-border transition-transform hover:-translate-y-0.5"
        >
          <X className="h-4 w-4" strokeWidth={3} />
        </Link>
      </div>

      {/* Book area — fills all space between title bar and fixed bottom bar */}
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
          onFlip={(e) => setCurrentPage(e.data)}
        >
          {mockBook.pages.map((page) => (
            <BookPage key={page.id} page={page} />
          ))}
        </HTMLFlipBook>
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed inset-x-0 bottom-0 border-t-[2.5px] border-foreground bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={goPrev}
            disabled={currentPage === 0}
            className="grid h-11 w-11 place-items-center rounded-full bg-background chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          >
            <ChevronLeft strokeWidth={3} />
          </button>

          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-black">
              {currentPage === 0 ? "Cover" : `Page ${currentPage} / ${totalPages - 1}`}
            </span>
            <button
              onClick={() => setAloud(!aloud)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold chunky-border ${
                aloud ? "bg-accent text-accent-foreground" : "bg-background"
              }`}
            >
              <Volume2 className="h-4 w-4" strokeWidth={2.5} />
              Read aloud
            </button>
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
