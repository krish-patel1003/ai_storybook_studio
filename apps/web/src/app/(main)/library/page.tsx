"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Plus,
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  Globe,
  Lock,
  ArrowRight,
  Pencil,
  Eye,
  ImageIcon,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, type BookSummaryOut, type BookOut } from "@/lib/api";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  pending: "Draft",
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

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Smart route: where to take the user based on book state
function continueRoute(book: BookSummaryOut): string {
  if (book.stage === "pending") return "/create";
  if (book.stage === "complete" && book.illustrated_page_count > 0) return "/editor";
  return "/outline";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const label = STAGE_LABELS[stage] ?? stage;
  const isComplete = stage === "complete";
  const isFailed = stage === "failed";
  const isPending = stage === "pending";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
      isComplete ? "bg-accent text-accent-foreground"
      : isFailed ? "bg-destructive/10 text-destructive"
      : isPending ? "bg-muted text-muted-foreground"
      : "bg-highlight text-foreground"
    }`}>
      {isComplete && <CheckCircle2 className="h-3 w-3" />}
      {isFailed && <XCircle className="h-3 w-3" />}
      {!isComplete && !isFailed && !isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </span>
  );
}

function DeleteDialog({
  title, onConfirm, onCancel, deleting,
}: { title: string; onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 chunky-border">
          <Trash2 className="h-5 w-5 text-destructive" strokeWidth={2.5} />
        </div>
        <h2 className="mt-3 font-display text-xl font-black">Delete book?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-bold text-foreground">&ldquo;{title}&rdquo;</span> will be permanently deleted.
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={onConfirm} disabled={deleting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive px-4 py-2.5 text-sm font-extrabold text-white chunky-border disabled:opacity-60">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={2.5} />}
            Delete
          </button>
          <button onClick={onCancel} className="rounded-xl bg-background px-4 py-2.5 text-sm font-extrabold chunky-border">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function BookCard({
  book, onContinue, onPreview, onDelete, onToggleVisibility,
  loadingContinue, loadingPreview, loadingVisibility,
}: {
  book: BookSummaryOut;
  onContinue: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
  loadingContinue: boolean;
  loadingPreview: boolean;
  loadingVisibility: boolean;
}) {
  const isPublic = book.visibility === "public";
  const hasIllustrations = book.illustrated_page_count > 0;
  const isComplete = book.stage === "complete";
  const canContinue = isComplete || book.stage === "pending" || book.stage === "failed";

  const continueIcon = book.stage === "pending"
    ? <Pencil className="h-4 w-4" strokeWidth={2.5} />
    : <BookOpen className="h-4 w-4" strokeWidth={2.5} />;

  const continueLabel = book.stage === "pending" ? "Continue" : book.stage === "failed" ? "View / retry" : "Open book";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex flex-col rounded-3xl bg-card chunky-border chunky-shadow-sm overflow-hidden"
    >
      {/* Card header / cover */}
      <div className="relative flex h-32 items-center justify-center bg-primary/10 border-b-[2.5px] border-foreground">
        <BookOpen className="h-14 w-14 text-primary/30" strokeWidth={1.5} />

        {/* Stage badge */}
        <div className="absolute top-3 right-3">
          <StageBadge stage={book.stage} />
        </div>

        {/* Visibility toggle */}
        <div className="absolute top-3 left-3">
          <button onClick={onToggleVisibility} disabled={loadingVisibility}
            title={isPublic ? "Make private" : "Make public"}
            className={`grid h-7 w-7 place-items-center rounded-full chunky-border transition-colors ${
              isPublic ? "bg-accent text-accent-foreground" : "bg-background text-muted-foreground hover:bg-secondary"
            }`}>
            {loadingVisibility
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : isPublic ? <Globe className="h-3.5 w-3.5" strokeWidth={2.5} />
              : <Lock className="h-3.5 w-3.5" strokeWidth={2.5} />}
          </button>
        </div>

        {/* Illustration progress strip */}
        {isComplete && book.page_count > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${Math.round((book.illustrated_page_count / book.page_count) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4 gap-2">
        <h3 className="font-display text-lg font-black leading-tight line-clamp-2">{book.title}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
          <span>{AGE_LABELS[book.age_range] ?? book.age_range}</span>
          {book.art_style && <><span>·</span><span className="capitalize">{book.art_style}</span></>}
          <span>·</span>
          <span>{book.page_count} pages</span>
        </div>

        {/* Illustrated count */}
        {isComplete && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <ImageIcon className="h-3 w-3" />
            {hasIllustrations
              ? `${book.illustrated_page_count} of ${book.page_count} illustrated`
              : "Not illustrated yet"}
          </div>
        )}

        <div className="mt-auto pt-1 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {relativeTime(book.updated_at)}
          </div>
          <span className={`text-xs font-bold ${isPublic ? "text-accent-foreground" : "text-muted-foreground"}`}>
            {isPublic ? "Public" : "Private"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button onClick={onContinue} disabled={!canContinue || loadingContinue}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:translate-y-0">
          {loadingContinue
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <>{continueIcon} {continueLabel}</>}
        </button>

        {hasIllustrations && (
          <button onClick={onPreview} disabled={loadingPreview}
            title="Preview book"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground chunky-border transition-transform hover:-translate-y-0.5">
            {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" strokeWidth={2.5} />}
          </button>
        )}

        <button onClick={onDelete} title="Delete book"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-background hover:bg-destructive/10 hover:text-destructive chunky-border transition-colors">
          <Trash2 className="h-4 w-4" strokeWidth={2.5} />
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
      <Link href="/create"
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
        <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Create a book
      </Link>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { setBook } = useBook();

  const [books, setBooks] = useState<BookSummaryOut[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [visibilityLoadingId, setVisibilityLoadingId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BookSummaryOut | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.books.list(token)
      .then(setBooks)
      .catch((e) => setError(e.message))
      .finally(() => setFetching(false));
  }, [token]);

  async function loadAndGo(book: BookSummaryOut, destination: string, setLoading: (id: string | null) => void) {
    if (!token) return;
    if (book.stage === "pending") {
      router.push("/create");
      return;
    }
    setLoading(book.id);
    try {
      const full = await api.books.get(token, book.id);
      setBook(full as unknown as BookOut);
      router.push(destination);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load book");
    } finally {
      setLoading(null);
    }
  }

  function continueBook(book: BookSummaryOut) {
    loadAndGo(book, continueRoute(book), setLoadingId);
  }

  function previewBook(book: BookSummaryOut) {
    loadAndGo(book, "/reader", setPreviewLoadingId);
  }

  async function toggleVisibility(book: BookSummaryOut) {
    if (!token) return;
    setVisibilityLoadingId(book.id);
    const next = book.visibility === "public" ? "private" : "public";
    try {
      await api.books.updateVisibility(token, book.id, next);
      setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, visibility: next } : b)));
      toast.success(`Book is now ${next}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update visibility");
    } finally {
      setVisibilityLoadingId(null);
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await api.books.delete(token, deleteTarget.id);
      setBooks((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      toast.success(`"${deleteTarget.title}" deleted`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  const completeCount = books.filter((b) => b.stage === "complete").length;

  return (
    <>
      <AnimatePresence>
        {deleteTarget && (
          <DeleteDialog
            title={deleteTarget.title}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteTarget(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-black md:text-5xl">My Library</h1>
            <p className="mt-1 text-muted-foreground">
              {books.length > 0
                ? `${books.length} book${books.length === 1 ? "" : "s"} · ${completeCount} complete`
                : "Your storybooks live here"}
            </p>
          </div>
          <Link href="/create"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
            <Plus className="h-4 w-4" strokeWidth={3} /> New book
          </Link>
        </div>

        {fetching ? (
          <div className="flex justify-center py-32">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="font-bold text-destructive">{error}</p>
            <button onClick={() => window.location.reload()}
              className="rounded-full bg-background px-4 py-2 text-sm font-bold chunky-border">
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
                  onContinue={() => continueBook(book)}
                  onPreview={() => previewBook(book)}
                  onDelete={() => setDeleteTarget(book)}
                  onToggleVisibility={() => toggleVisibility(book)}
                  loadingContinue={loadingId === book.id}
                  loadingPreview={previewLoadingId === book.id}
                  loadingVisibility={visibilityLoadingId === book.id}
                />
              ))
            )}
          </div>
        )}
      </main>
    </>
  );
}
