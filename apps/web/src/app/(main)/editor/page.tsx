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
  Download,
  Link2,
  Share2,
  X,
  Volume2,
  Mic,
  Expand,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, pageImageUrl, type PageOut, type BookOut, type VoiceProfile } from "@/lib/api";
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

function useAudioPreview(bookId: string, pageId: string, token: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(false);

  async function togglePreview() {
    if (previewing && audioRef.current) {
      audioRef.current.pause();
      setPreviewing(false);
      return;
    }
    if (!token) return;
    setLoading(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/books/${bookId}/pages/${pageId}/audio`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setLoading(false); return; }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      audio.onended = () => { setPreviewing(false); URL.revokeObjectURL(blobUrl); };
      audio.onpause = () => setPreviewing(false);
      audioRef.current = audio;
      await audio.play();
      setPreviewing(true);
    } finally {
      setLoading(false);
    }
  }

  return { previewing, loading, togglePreview };
}

// ── Per-page preview modal ───────────────────────────────────────────────────

function PagePreviewModal({
  page,
  blobUrl,
  onClose,
}: {
  page: PageOut;
  blobUrl: string | null;
  onClose: () => void;
}) {
  // Close on backdrop click or Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden chunky-border chunky-shadow"
        style={{ aspectRatio: "148/210" }}  /* A5 portrait */
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        {blobUrl ? (
          <img
            src={blobUrl}
            alt={`Page ${page.order}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <ImageIcon className="h-12 w-12 opacity-20" strokeWidth={1.5} />
          </div>
        )}

        {/* Gradient overlay — taller than text zone for smooth blend */}
        {page.text && (
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              height: "52%",
              background: "linear-gradient(to bottom, transparent 0%, transparent 15%, rgba(250,248,243,0.45) 38%, rgba(250,248,243,0.88) 58%, rgba(250,248,243,0.97) 72%, #faf8f3 100%)",
            }}
          />
        )}

        {/* Text */}
        {page.text && (
          <div
            className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-1"
            style={{ height: "36%" }}
          >
            <p
              className="text-xs font-bold leading-relaxed text-foreground line-clamp-4"
              style={{ fontFamily: '"Nunito", sans-serif' }}
            >
              {page.text}
            </p>
          </div>
        )}

        {/* Cover overlay */}
        {page.is_cover && page.text && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-6 px-4 text-center"
            style={{
              height: "45%",
              background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,20,0.55) 40%, rgba(10,10,20,0.88) 100%)",
            }}
          >
            <p
              className="text-white text-lg font-black leading-tight"
              style={{ fontFamily: '"Fredoka", sans-serif' }}
            >
              {page.text}
            </p>
          </div>
        )}

        {/* Page label */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex h-7 items-center justify-center rounded-full bg-background/90 px-2.5 font-display text-xs font-black chunky-border">
            {page.is_cover ? "Cover" : `Page ${page.order}`}
          </span>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full bg-background/90 chunky-border hover:bg-background transition-colors"
        >
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

function PageCard({
  page,
  bookId,
  token,
  status,
  elapsed,
  onGenerate,
  onNarrate,
  narrateStatus,
}: {
  page: PageOut;
  bookId: string;
  token: string | null;
  status: "idle" | "generating" | "done" | "error";
  elapsed: number;
  onGenerate: () => void;
  onNarrate: () => void;
  narrateStatus: "idle" | "narrating" | "done" | "error";
}) {
  const imgUrl = pageImageUrl(bookId, page.id);
  const blobUrl = useAuthImage(imgUrl, token, page.has_image);
  const { previewing, loading: previewLoading, togglePreview } = useAudioPreview(bookId, page.id, token);
  const [showPreview, setShowPreview] = useState(false);

  const fmt = (s: number) => `${Math.floor(s / 60) > 0 ? `${Math.floor(s / 60)}m ` : ""}${(s % 60).toString().padStart(2, "0")}s`;

  return (
    <>
    {showPreview && (
      <PagePreviewModal page={page} blobUrl={blobUrl} onClose={() => setShowPreview(false)} />
    )}
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

        {/* Page number + preview button row */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-background font-display text-sm font-black chunky-border">
            {page.is_cover ? "C" : page.order}
          </span>
          {(blobUrl || page.text) && (
            <button
              onClick={() => setShowPreview(true)}
              title="Preview page"
              className="grid h-7 w-7 place-items-center rounded-full bg-background/90 chunky-border hover:bg-background transition-colors"
            >
              <Expand className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          )}
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

      {/* Per-page buttons */}
      <div className="flex gap-2 px-4 pb-4">
        {/* Illustrate */}
        <button
          onClick={onGenerate}
          disabled={status === "generating"}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-background py-2 text-xs font-extrabold chunky-border hover:bg-secondary transition-colors disabled:opacity-40"
        >
          {status === "generating" ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
          ) : page.has_image ? (
            <><RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} /> Reillustrate</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} /> Illustrate</>
          )}
        </button>

        {/* Narrate + preview — only for pages with text */}
        {page.text && (
          <div className="flex gap-1.5">
            {/* Preview play button — only when audio exists */}
            {page.has_audio && (
              <button
                onClick={togglePreview}
                disabled={previewLoading}
                title={previewing ? "Stop preview" : "Preview narration"}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary chunky-border hover:bg-primary/20 transition-colors disabled:opacity-40"
              >
                {previewLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : previewing ? (
                  <span className="h-3 w-3 rounded-sm bg-primary" />
                ) : (
                  <Play className="h-3.5 w-3.5" strokeWidth={2.5} fill="currentColor" />
                )}
              </button>
            )}

            {/* Narrate button */}
            <button
              onClick={onNarrate}
              disabled={narrateStatus === "narrating"}
              title={page.has_audio ? "Re-narrate this page" : "Narrate this page"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-background chunky-border hover:bg-secondary transition-colors disabled:opacity-40"
            >
              {narrateStatus === "narrating" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mic className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ── Export modal ──────────────────────────────────────────────────────────────

function ExportModal({ book, token, onClose }: { book: BookOut; token: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingEpub, setDownloadingEpub] = useState(false);
  const [makingPublic, setMakingPublic] = useState(false);
  const [isPublic, setIsPublic] = useState(book.visibility === "public");
  const [exportFont, setExportFont] = useState("nunito");
  const [exportFonts, setExportFonts] = useState<Array<{ id: string; label: string; is_default: boolean }>>([]);
  const { updateBook } = useBook();

  useEffect(() => {
    if (!token) return;
    api.books.listExportFonts(token).then((r) => {
      if (r.fonts?.length) setExportFonts(r.fonts);
    }).catch(() => {});
  }, [token]);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/read/public/${book.id}`
    : "";

  async function handleShare() {
    if (!token) return;
    setMakingPublic(true);
    try {
      if (!isPublic) {
        const updated = await api.books.updateVisibility(token, book.id, "public");
        updateBook({ visibility: updated.visibility });
        setIsPublic(true);
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Link copied!");
    } catch {
      toast.error("Failed to copy link");
    } finally {
      setMakingPublic(false);
    }
  }

  async function downloadFile(fetcher: Promise<Response>, filename: string) {
    const res = await fetcher;
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePdf() {
    if (!token) return;
    setDownloadingPdf(true);
    try {
      const title = book.brief?.title ?? book.title;
      await downloadFile(api.books.exportPdf(token, book.id, exportFont), `${title}.pdf`);
      toast.success("PDF downloaded!");
    } catch {
      toast.error("PDF export failed");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleEpub() {
    if (!token) return;
    setDownloadingEpub(true);
    try {
      const title = book.brief?.title ?? book.title;
      await downloadFile(api.books.exportEpub(token, book.id, exportFont), `${title}.epub`);
      toast.success("Kindle edition downloaded!");
    } catch {
      toast.error("Kindle export failed");
    } finally {
      setDownloadingEpub(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-black">Export book</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border hover:bg-secondary">
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Shareable link */}
          <div className="rounded-2xl bg-background p-4 chunky-border">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 chunky-border">
                <Link2 className="h-5 w-5 text-primary" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-black">Shareable link</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPublic ? "Anyone with the link can view this book." : "Makes your book public then copies the link."}
                </p>
                {isPublic && (
                  <p className="mt-1.5 truncate rounded-lg bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
                    {shareUrl}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleShare}
              disabled={makingPublic}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-extrabold text-primary-foreground chunky-border disabled:opacity-60"
            >
              {makingPublic ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" strokeWidth={3} /> : <Share2 className="h-4 w-4" strokeWidth={2.5} />}
              {copied ? "Copied!" : isPublic ? "Copy link" : "Make public & copy link"}
            </button>
          </div>

          {/* Font picker — applies to both PDF and Kindle edition */}
          {exportFonts.length > 0 && (
            <div className="rounded-2xl bg-background p-4 chunky-border">
              <p className="mb-2 text-sm font-extrabold">Story font</p>
              <div className="flex flex-wrap gap-2">
                {exportFonts.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setExportFont(f.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold chunky-border transition-colors ${
                      exportFont === f.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-card hover:bg-secondary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PDF */}
          <div className="rounded-2xl bg-background p-4 chunky-border">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/50 chunky-border">
                <Download className="h-5 w-5 text-foreground" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="font-display text-base font-black">Download PDF</p>
                <p className="text-xs text-muted-foreground mt-0.5">A5 print-ready, all illustrations + text.</p>
              </div>
            </div>
            <button
              onClick={handlePdf}
              disabled={downloadingPdf}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-extrabold text-background chunky-border disabled:opacity-60"
            >
              {downloadingPdf ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Download className="h-4 w-4" strokeWidth={2.5} /> Download PDF</>}
            </button>
          </div>

          {/* Amazon Kindle */}
          <div className="rounded-2xl bg-background p-4 chunky-border">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-highlight chunky-border">
                <Download className="h-5 w-5 text-foreground" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="font-display text-base font-black">Amazon Kindle Ready</p>
                <p className="text-xs text-muted-foreground mt-0.5">Upload directly to KDP or send to your device.</p>
              </div>
            </div>
            <button
              onClick={handleEpub}
              disabled={downloadingEpub}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-extrabold text-background chunky-border disabled:opacity-60"
            >
              {downloadingEpub ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Download className="h-4 w-4" strokeWidth={2.5} /> Download Kindle Edition</>}
            </button>
          </div>

          {/* Narration status */}
          {book.pages.some((p) => p.has_audio) && (
            <div className="flex items-center gap-3 rounded-2xl bg-background px-4 py-3 chunky-border">
              <Volume2 className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
              <span className="text-sm font-bold">
                {book.pages.filter((p) => p.has_audio).length} of {book.pages.filter((p) => p.text).length} pages narrated
              </span>
              <span className="text-xs text-muted-foreground">· playable in the reader</span>
            </div>
          )}
        </div>
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

  const [showExport, setShowExport] = useState(false);
  const [mode, setMode] = useState<Mode>("one-by-one");
  const [concurrency, setConcurrency] = useState<Concurrency>("sync");
  const [pageStatuses, setPageStatuses] = useState<Record<string, PageStatus>>({});
  const [pageElapsed, setPageElapsed] = useState<Record<string, number>>({});
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef(false);
  const timer = useTimer();

  // Narration state
  const [narratingBook, setNarratingBook] = useState(false);
  const [narrateProgress, setNarrateProgress] = useState<{ done: number; total: number } | null>(null);
  const [pageNarrateStatuses, setPageNarrateStatuses] = useState<Record<string, "idle" | "narrating" | "done" | "error">>({});
  // Voice selection — preset Gemini voices or cloned user profiles
  type VoiceChoice =
    | { type: "preset"; id: string }
    | { type: "clone"; profileId: string; name: string };

  const [selectedVoice, setSelectedVoice] = useState<VoiceChoice>({ type: "preset", id: "Kore" });
  const [availableVoices, setAvailableVoices] = useState<Array<{ id: string; description: string; is_default: boolean }>>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);

  useEffect(() => {
    if (!token) return;
    api.books.listVoices(token).then((res) => {
      if (res.voices?.length) setAvailableVoices(res.voices);
    }).catch(() => {/* voices are a nice-to-have */});
    api.voices.list(token).then(setVoiceProfiles).catch(() => {});
  }, [token]);

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

  async function handleNarrate() {
    if (!token || !book) return;
    // Always narrate all text pages with the currently selected voice
    // (re-narrates even if audio already exists, so voice changes take effect)
    const textPages = book.pages.filter((p) => p.text);
    if (textPages.length === 0) { toast("No pages with text to narrate yet."); return; }
    setNarratingBook(true);
    setNarrateProgress({ done: 0, total: textPages.length });
    try {
      for (const page of textPages) {
        const updated = await api.books.narratePage(
          token, book.id, page.id,
          selectedVoice.type === "preset" ? selectedVoice.id : undefined,
          selectedVoice.type === "clone" ? selectedVoice.profileId : undefined,
        );
        updateBook(updated);
        setNarrateProgress((p) => p ? { ...p, done: p.done + 1 } : null);
      }
      toast.success("Narration complete! Open the reader to listen.");
    } catch {
      toast.error("Narration failed — please try again.");
    } finally {
      setNarratingBook(false);
      setNarrateProgress(null);
    }
  }

  async function handleNarrateOne(page: PageOut) {
    if (!token || !book) return;
    setPageNarrateStatuses((s) => ({ ...s, [page.id]: "narrating" }));
    try {
      const updated = await api.books.narratePage(
        token, book.id, page.id,
        selectedVoice.type === "preset" ? selectedVoice.id : undefined,
        selectedVoice.type === "clone" ? selectedVoice.profileId : undefined,
      );
      updateBook(updated);
      setPageNarrateStatuses((s) => ({ ...s, [page.id]: "done" }));
    } catch {
      setPageNarrateStatuses((s) => ({ ...s, [page.id]: "error" }));
      toast.error("Narration failed for this page.");
    }
  }

  if (!book) return <main className="mx-auto max-w-7xl px-4 py-10"><NoBook /></main>;

  const allPages = [...book.pages].sort((a, b) => a.order - b.order);
  const illustratedCount = allPages.filter((p) => p.has_image).length;
  const totalCount = allPages.length;
  const generatingCount = Object.values(pageStatuses).filter((s) => s === "generating").length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      {showExport && (
        <ExportModal book={book as BookOut} token={token} onClose={() => setShowExport(false)} />
      )}
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <Link href="/outline" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Outline
          </Link>
          <div className="flex items-center gap-2">
            {illustratedCount > 0 && (
              <Link
                href="/reader?from=editor"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-extrabold text-accent-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
              >
                <Eye className="h-4 w-4" strokeWidth={2.5} />
                Preview book
              </Link>
            )}
            <button
              onClick={() => setShowExport(true)}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-extrabold text-background chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
            >
              <Download className="h-4 w-4" strokeWidth={2.5} />
              Export
            </button>
          </div>
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

      {/* Narration bar — only shown once pages have text */}
      {allPages.some((p) => p.text) && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 chunky-border">
              <Volume2 className="h-4 w-4 text-primary" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-extrabold">Audio narration</p>
              <p className="text-xs text-muted-foreground">
                {allPages.filter((p) => p.has_audio).length} of {allPages.filter((p) => p.text).length} pages narrated
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Voice picker */}
            {(availableVoices.length > 0 || voiceProfiles.length > 0) && (
              <select
                value={
                  selectedVoice.type === "preset"
                    ? `preset:${selectedVoice.id}`
                    : `clone:${selectedVoice.profileId}`
                }
                onChange={(e) => {
                  const [type, id] = e.target.value.split(":");
                  if (type === "preset") {
                    setSelectedVoice({ type: "preset", id });
                  } else {
                    const profile = voiceProfiles.find((p) => p.id === id);
                    if (profile) setSelectedVoice({ type: "clone", profileId: id, name: profile.name });
                  }
                }}
                disabled={narratingBook}
                className="rounded-full border border-border bg-card px-3 py-2 text-xs font-bold chunky-border disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                title="Select narrator voice"
              >
                {availableVoices.length > 0 && (
                  <optgroup label="── Preset Voices ──">
                    {availableVoices.map((v) => (
                      <option key={v.id} value={`preset:${v.id}`}>
                        {v.id} — {v.description}
                      </option>
                    ))}
                  </optgroup>
                )}
                {voiceProfiles.length > 0 && (
                  <optgroup label="── Your Voices ──">
                    {voiceProfiles.map((p) => (
                      <option key={p.id} value={`clone:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {voiceProfiles.length === 0 && (
                  <optgroup label="──────────────────">
                    <option disabled value="">
                      + Create a voice in Voice Studio
                    </option>
                  </optgroup>
                )}
              </select>
            )}
            <button
              onClick={handleNarrate}
              disabled={narratingBook || allPages.filter((p) => p.text).length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0"
            >
              {narratingBook ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {narrateProgress ? `Narrating ${narrateProgress.done + 1} of ${narrateProgress.total}…` : "Starting…"}
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" strokeWidth={2.5} />
                  {selectedVoice.type === "clone"
                    ? `Narrate as ${selectedVoice.name}`
                    : allPages.filter((p) => p.has_audio).length > 0
                    ? "Re-narrate all"
                    : "Narrate all pages"}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Character consistency warning */}
      {book.characters.length > 0 && book.characters.every((c) => !c.has_reference_image) && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-highlight/60 px-4 py-3 chunky-border text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2.5} />
          <span className="font-bold">Character sheets not generated.</span>
          <span className="text-muted-foreground">Illustrations may lack character consistency.</span>
          <Link href="/outline" className="ml-auto shrink-0 text-xs font-extrabold underline underline-offset-2">
            Generate sheets →
          </Link>
        </div>
      )}

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
            onNarrate={() => handleNarrateOne(page)}
            narrateStatus={pageNarrateStatuses[page.id] ?? "idle"}
          />
        ))}
      </div>
    </main>
  );
}
