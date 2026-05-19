"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  BookOpen,
  Plus,
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, type BookSummaryOut, type BookOut } from "@/lib/api";
import { toast } from "sonner";

const STAGE_LABELS: Record<string, string> = {
  pending: "Pending",
  enhancing: "Enhancing…",
  characters: "Building characters…",
  outline: "Writing outline…",
  pages: "Writing pages…",
  complete: "Complete",
  failed: "Failed",
};

const AGE_LABELS: Record<string, string> = {
  "3-5": "Ages 3–5",
  "6-8": "Ages 6–8",
  "9-11": "Ages 9–11",
};

function StageBadge({ stage }: { stage: string }) {
  const label = STAGE_LABELS[stage] ?? stage;
  const isComplete = stage === "complete";
  const isFailed = stage === "failed";
  const isProcessing = !isComplete && !isFailed;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
        isComplete
          ? "bg-accent text-accent-foreground"
          : isFailed
          ? "bg-destructive/10 text-destructive"
          : "bg-highlight text-foreground"
      }`}
    >
      {isComplete && <CheckCircle2 className="h-3 w-3" />}
      {isFailed && <XCircle className="h-3 w-3" />}
      {isProcessing && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </span>
  );
}

function BookCard({
  book,
  onOpen,
  loading,
}: {
  book: BookSummaryOut;
  onOpen: () => void;
  loading: boolean;
}) {
  const date = new Date(book.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex flex-col rounded-3xl bg-card chunky-border chunky-shadow-sm overflow-hidden"
    >
      {/* Colour block header */}
      <div className="relative flex h-28 items-center justify-center bg-primary/10 border-b-[2.5px] border-foreground">
        <BookOpen className="h-12 w-12 text-primary/40" strokeWidth={1.5} />
        <div className="absolute top-3 right-3">
          <StageBadge stage={book.stage} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 gap-2">
        <h3 className="font-display text-lg font-black leading-tight line-clamp-2">
          {book.title}
        </h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
          <span>{AGE_LABELS[book.age_range] ?? book.age_range}</span>
          <span>·</span>
          <span className="capitalize">{book.art_style}</span>
          <span>·</span>
          <span>{book.page_count} pages</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-auto pt-2">
          <Clock className="h-3 w-3" /> {date}
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={onOpen}
          disabled={book.stage !== "complete" || loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:translate-y-0"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <BookOpen className="h-4 w-4" strokeWidth={2.5} />
              {book.stage === "complete" ? "Open book" : "In progress…"}
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-6 py-24 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-3xl bg-muted chunky-border">
        <BookOpen className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="font-display text-2xl font-black">No books yet</h2>
        <p className="mt-1 text-muted-foreground">Create your first storybook to see it here.</p>
      </div>
      <Link
        href="/create"
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
      >
        <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Create a book
      </Link>
    </div>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { setBook } = useBook();

  const [books, setBooks] = useState<BookSummaryOut[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.books
      .list(token)
      .then(setBooks)
      .catch((e) => setError(e.message))
      .finally(() => setFetching(false));
  }, [token]);

  async function openBook(id: string) {
    if (!token) return;
    setLoadingId(id);
    try {
      const book = await api.books.get(token, id);
      setBook(book as unknown as BookOut);
      router.push("/outline");
    } catch (e: any) {
      toast.error(e.message ?? "Could not load book");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-4xl font-black md:text-5xl">My Library</h1>
          <p className="mt-1 text-muted-foreground">
            {books.length > 0
              ? `${books.length} book${books.length === 1 ? "" : "s"}`
              : "Your storybooks live here"}
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
        >
          <Plus className="h-4 w-4" strokeWidth={3} /> New book
        </Link>
      </div>

      {/* Content */}
      {fetching ? (
        <div className="flex justify-center py-32">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="font-bold text-destructive">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-background px-4 py-2 text-sm font-bold chunky-border"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {books.length === 0 ? (
            <EmptyState />
          ) : (
            books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onOpen={() => openBook(book.id)}
                loading={loadingId === book.id}
              />
            ))
          )}
        </div>
      )}
    </main>
  );
}
