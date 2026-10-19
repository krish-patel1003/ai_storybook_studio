"use client";

import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  RefreshCw,
  BookOpen,
  ImageIcon,
  Check,
  ArrowLeft,
  Clock,
  Eye,
  Download,
  X,
  Volume2,
  Mic,
  Expand,
  Play,
  Link2,
  Square as StopIcon,
} from "lucide-react";
import { XsSpinner, SmSpinner, MdSpinner, LgSpinner } from "@/components/character-spinner";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { useSubscription } from "@/lib/use-subscription";
import { StepBar } from "@/components/step-bar";
import { LeaveGuard } from "@/components/leave-guard";
import { api, pageImageUrl, type PageOut, type BookOut, type VoiceProfile } from "@/lib/api";
import { useRelativeTime } from "@/lib/use-relative-time";
import { estimateLabel, estimateIllustrationSeconds } from "@/lib/fun-estimate";
import { EstimatePopup } from "@/components/estimate-popup";
import { useCyclingMessage } from "@/lib/use-cycling-message";
import { useAuthImage, bustAuthImageCache } from "@/lib/use-auth-image";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

// ── Module-level illustration job ─────────────────────────────────────────────

type PageIllStatus = "idle" | "generating" | "done" | "error";

interface IllJob {
  bookId: string;
  total: number;
  done: number;
  sheetsGenerating: boolean;
  started: number;
  pageStatuses: Record<string, PageIllStatus>;
  aborted: boolean;
}

let _job: IllJob | null = null;
// Receives only the single page that just finished, so a stale whole-book
// snapshot from a concurrent request can't overwrite sibling pages.
let _onPageDone: ((page: PageOut) => void) | null = null;
const _subs = new Set<() => void>();

function _notifyJob() { _subs.forEach((fn) => fn()); }

function stopIllJob(bookId: string) {
  if (_job?.bookId === bookId) { _job.aborted = true; _notifyJob(); }
}

function useIllJob(bookId: string | undefined): IllJob | null {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    _subs.add(tick);
    return () => { _subs.delete(tick); };
  }, []);
  // An aborted job reads as "no job" so the UI reverts to idle immediately.
  return _job && _job.bookId === bookId && !_job.aborted ? _job : null;
}

async function startIllJob(
  token: string,
  book: BookOut,
  onPageDone: (page: PageOut) => void,
  reconcile: () => void,
): Promise<{ failedCount: number; aborted: boolean }> {
  const bookId = book.id;
  // A live (non-aborted) job for this book is already running — don't double-start.
  if (_job?.bookId === bookId && !_job.aborted && _job.done < _job.total) {
    return { failedCount: 0, aborted: false };
  }

  const pages = [...book.pages].sort((a, b) => a.order - b.order);

  const myJob: IllJob = {
    bookId,
    total: pages.length,
    done: 0,
    sheetsGenerating: false,
    started: Date.now(),
    pageStatuses: Object.fromEntries(pages.map((p) => [p.id, "idle" as PageIllStatus])),
    aborted: false,
  };
  _job = myJob;
  _onPageDone = onPageDone;
  _notifyJob();

  const needsSheets =
    book.characters.length > 0 &&
    book.characters.every((c) => !c.has_reference_image);

  if (needsSheets) {
    myJob.sheetsGenerating = true;
    _notifyJob();
    try { await api.books.generateCharacterSheets(token, bookId); } catch { /* non-fatal */ }
    if (_job === myJob) { myJob.sheetsGenerating = false; _notifyJob(); }
  }

  // Gemini image generation has a real-world rate limit. Firing every page's
  // illustrate request at once (unbounded Promise.all) stampedes the API and
  // a chunk of pages come back as transient errors — which used to surface as
  // a silent failure requiring the user to click "Illustrate all" again.
  // A small concurrency pool keeps us under the limit so a single click
  // actually finishes the whole book.
  const CONCURRENCY = 3;

  async function runPage(page: (typeof pages)[number]): Promise<boolean> {
    try {
      const updated = page.is_back_cover
        ? await api.books.illustrateBackCover(token, bookId)
        : await api.books.illustratePage(token, bookId, page.id);
      bustAuthImageCache(pageImageUrl(bookId, page.id));
      if (_job === myJob) {
        myJob.pageStatuses[page.id] = "done";
        // Only trust this response for the page it was actually for — merge that
        // single page, never the whole (possibly stale) book snapshot.
        const freshPage = updated.pages.find((p) => p.id === page.id);
        if (freshPage) _onPageDone?.(freshPage);
        _notifyJob();
      }
      return true;
    } catch {
      if (_job === myJob) {
        myJob.pageStatuses[page.id] = "error";
        _notifyJob();
      }
      return false;
    }
  }

  async function runPool(targets: typeof pages) {
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
        while (i < targets.length) {
          // Stop if this run was aborted or superseded by a newer job.
          if (_job !== myJob || myJob.aborted) break;
          const page = targets[i++];
          const ok = await runPage(page);
          if (_job === myJob) { myJob.done++; _notifyJob(); }
          void ok;
        }
      }),
    );
  }

  for (const p of pages) myJob.pageStatuses[p.id] = "generating";
  _notifyJob();

  await runPool(pages);

  // Auto-retry pages that failed (transient rate-limit/API errors) once more
  // before giving up, instead of forcing the user to re-click the button.
  for (let retry = 0; retry < 2; retry++) {
    if (_job !== myJob || myJob.aborted) break;
    const failed = pages.filter((p) => myJob.pageStatuses[p.id] === "error");
    if (failed.length === 0) break;
    myJob.done -= failed.length;
    for (const p of failed) myJob.pageStatuses[p.id] = "generating";
    _notifyJob();
    await new Promise(r => setTimeout(r, 4000));
    await runPool(failed);
  }

  const failedCount = pages.filter((p) => myJob.pageStatuses[p.id] === "error").length;

  // Stopped by the user (or superseded) — clear our job, skip reconcile/success toast.
  if (myJob.aborted || _job !== myJob) {
    if (_job === myJob) { _job = null; _notifyJob(); }
    return { failedCount, aborted: true };
  }

  // Reconcile once against ground truth so the final state is always authoritative,
  // regardless of the order concurrent per-page responses arrived in.
  reconcile();

  setTimeout(() => {
    if (_job === myJob) { _job = null; _notifyJob(); }
  }, 5000);

  return { failedCount, aborted: false };
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setElapsed(0);
    ref.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  const stop = useCallback(() => {
    if (ref.current) { clearInterval(ref.current); ref.current = null; }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${(s % 60).toString().padStart(2, "0")}s` : `${s}s`;
  };

  return { elapsed, formatted: fmt(elapsed), start, stop };
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
        <p className="mt-1 text-muted-foreground">Start a new book or open one from your library.</p>
      </div>
      <div className="flex gap-3">
        <Link href="/create" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">New book</Link>
        <Link href="/library" className="inline-flex items-center gap-1.5 rounded-full bg-card px-5 py-2.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">Library</Link>
      </div>
    </div>
  );
}

// ── Audio preview hook ────────────────────────────────────────────────────────

function useAudioPreview(bookId: string, pageId: string, token: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(false);

  async function togglePreview() {
    if (previewing && audioRef.current) { audioRef.current.pause(); setPreviewing(false); return; }
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
    } finally { setLoading(false); }
  }

  return { previewing, loading, togglePreview };
}

// ── Page preview modal ────────────────────────────────────────────────────────

function PagePreviewModal({ page, blobUrl, onClose }: { page: PageOut; blobUrl: string | null; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden chunky-border chunky-shadow" style={{ aspectRatio: "148/210" }} onClick={(e) => e.stopPropagation()}>
        {blobUrl ? (
          <img src={blobUrl} alt={`Page ${page.order}`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <ImageIcon className="h-12 w-12 opacity-20" strokeWidth={1.5} />
          </div>
        )}
        {page.text && !page.is_cover && (
          <>
            <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: "52%", background: "linear-gradient(to bottom, transparent 0%, transparent 15%, rgba(250,248,243,0.45) 38%, rgba(250,248,243,0.88) 58%, rgba(250,248,243,0.97) 72%, #faf8f3 100%)" }} />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-3" style={{ height: "36%" }}>
              <p className="text-xs font-bold leading-relaxed text-foreground line-clamp-4" style={{ fontFamily: '"Nunito", sans-serif' }}>{page.text}</p>
            </div>
          </>
        )}
        {page.is_cover && page.text && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-6 px-4 text-center" style={{ height: "45%", background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,20,0.55) 40%, rgba(10,10,20,0.88) 100%)" }}>
            <p className="text-white text-lg font-black leading-tight" style={{ fontFamily: '"Kranky", serif' }}>{page.text}</p>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="inline-flex h-7 items-center justify-center rounded-full bg-background/90 px-2.5 font-display text-xs font-black chunky-border">
            {page.is_cover ? "Cover" : page.is_back_cover ? "Back" : `Page ${page.order}`}
          </span>
        </div>
        <button onClick={onClose} className="absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full bg-background/90 chunky-border hover:bg-background transition-colors">
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

// ── Illustration messages ─────────────────────────────────────────────────────

const ILL_MSGS = [
  "Mixing the right colours…", "Painting the background first…", "Adding the characters…",
  "Getting the lighting just right…", "Brushing in the details…", "Drawing tiny details only kids will find…",
  "Adding texture and depth…", "Deciding on the colour palette…", "Making sure the characters look right…",
  "Blending the colours…", "Composing the scene…", "Finding the right mood…",
  "Bringing the page to life…", "Almost there…",
];

// ── Page card ─────────────────────────────────────────────────────────────────

function PageCard({
  page, bookId, token, status, elapsed, onGenerate, onNarrate, narrateStatus,
}: {
  page: PageOut; bookId: string; token: string | null;
  status: PageIllStatus; elapsed: number;
  onGenerate: () => void; onNarrate: () => void;
  narrateStatus: "idle" | "narrating" | "done" | "error";
}) {
  const blobUrl = useAuthImage(pageImageUrl(bookId, page.id, page.image_version), token, page.has_image);
  const { previewing, loading: previewLoading, togglePreview } = useAudioPreview(bookId, page.id, token);
  const [showPreview, setShowPreview] = useState(false);
  const illMsg = useCyclingMessage(ILL_MSGS, 2800);

  const fmt = (s: number) => `${Math.floor(s / 60) > 0 ? `${Math.floor(s / 60)}m ` : ""}${(s % 60).toString().padStart(2, "0")}s`;

  return (
    <>
      {showPreview && <PagePreviewModal page={page} blobUrl={blobUrl} onClose={() => setShowPreview(false)} />}
      <div className={`flex flex-col rounded-3xl bg-card chunky-border chunky-shadow-sm overflow-hidden transition-all ${status === "generating" ? "ring-2 ring-primary/50" : ""}`}>
        <div className="relative aspect-[4/3] bg-muted border-b-[2.5px] border-foreground overflow-hidden">
          {status === "generating" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-3">
              <LgSpinner />
              <div className="text-center">
                <AnimatePresence mode="wait">
                  <motion.p key={illMsg} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }} className="text-xs font-bold text-muted-foreground min-h-[1rem]">
                    {illMsg}
                  </motion.p>
                </AnimatePresence>
                {elapsed > 0 && (
                  <p className="text-xs text-primary font-extrabold mt-0.5 flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" /> {fmt(elapsed)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                {page.has_image && !blobUrl ? <MdSpinner className="opacity-60" /> : !blobUrl ? (
                  <><ImageIcon className="h-10 w-10 opacity-30" strokeWidth={1.5} /><span className="text-xs font-bold opacity-50">{status === "error" ? "Failed" : "No picture yet"}</span></>
                ) : null}
              </div>
              {blobUrl && <img src={blobUrl} alt={`Page ${page.order}`} className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500" />}
            </>
          )}

          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-background font-display text-sm font-black chunky-border">
              {page.is_cover ? "C" : page.is_back_cover ? "B" : page.order}
            </span>
            {(blobUrl || page.text) && (
              <button onClick={() => setShowPreview(true)} title="Preview" className="grid h-7 w-7 place-items-center rounded-full bg-background/90 chunky-border hover:bg-background transition-colors">
                <Expand className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>
          {status === "done" && blobUrl && <div className="absolute bottom-3 right-3"><span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground"><Check className="h-3 w-3" strokeWidth={3} /> Done</span></div>}
          {status === "error" && <div className="absolute bottom-3 right-3"><span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">Failed</span></div>}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            {page.is_cover ? "Cover" : page.is_back_cover ? "Back cover" : page.narrative_role}
          </span>
          {page.text ? <p className="text-sm leading-relaxed line-clamp-3">{page.text}</p> : <p className="text-sm italic text-muted-foreground">No text</p>}
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onGenerate} disabled={status === "generating"} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-background py-2 text-xs font-extrabold chunky-border hover:bg-secondary transition-colors disabled:opacity-40">
            {status === "generating" ? <><XsSpinner /> Generating…</> : page.has_image ? <><RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} /> Remake picture</> : <><Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} /> Make picture</>}
          </button>
          {page.text && (
            <div className="flex gap-1.5">
              {page.has_audio && (
                <button onClick={togglePreview} disabled={previewLoading} title={previewing ? "Stop" : "Preview audio"} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary chunky-border hover:bg-primary/20 transition-colors disabled:opacity-40">
                  {previewLoading ? <XsSpinner /> : previewing ? <span className="h-3 w-3 rounded-sm bg-primary" /> : <Play className="h-3.5 w-3.5" strokeWidth={2.5} fill="currentColor" />}
                </button>
              )}
              <button onClick={onNarrate} disabled={narrateStatus === "narrating"} title={page.has_audio ? "Re-narrate" : "Narrate"} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-background chunky-border hover:bg-secondary transition-colors disabled:opacity-40">
                {narrateStatus === "narrating" ? <XsSpinner /> : <Mic className="h-3.5 w-3.5" strokeWidth={2.5} />}
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
  const [makingPublic, setMakingPublic] = useState(false);
  const [isPublic, setIsPublic] = useState(book.visibility === "public");
  const [exportFont, setExportFont] = useState("nunito");
  const [exportFonts, setExportFonts] = useState<Array<{ id: string; label: string; is_default: boolean }>>([]);
  const { updateBook } = useBook();

  useEffect(() => {
    if (!token) return;
    api.books.listExportFonts(token).then((r) => { if (r.fonts?.length) setExportFonts(r.fonts); }).catch(() => {});
  }, [token]);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/read/public/${book.id}` : "";

  async function handleShare() {
    if (!token) return;
    setMakingPublic(true);
    try {
      if (!isPublic) { const updated = await api.books.updateVisibility(token, book.id, "public"); updateBook({ visibility: updated.visibility }); setIsPublic(true); }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
      toast.success("Link copied!");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to copy link — try again"); } finally { setMakingPublic(false); }
  }

  async function handlePdf() {
    if (!token) return;
    setDownloadingPdf(true);
    try {
      const res = await api.books.exportPdf(token, book.id, exportFont);
      if (!res.ok) throw new Error();
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${(book.brief?.title ?? book.title).replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
    } catch (err) { toast.error(err instanceof Error ? err.message : "PDF export failed — please try again"); } finally { setDownloadingPdf(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-black">Export book</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border hover:bg-secondary"><X className="h-4 w-4" strokeWidth={2.5} /></button>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-background p-4 chunky-border">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Share link</p>
            <p className="text-xs text-muted-foreground mb-3">Anyone with the link can read your book for free.</p>
            <button onClick={handleShare} disabled={makingPublic} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0">
              {makingPublic ? <><XsSpinner /> Making public…</> : copied ? <><Check className="h-4 w-4" strokeWidth={3} /> Copied!</> : <><Link2 className="h-4 w-4" strokeWidth={2.5} /> Copy share link</>}
            </button>
          </div>
          <div className="rounded-2xl bg-background p-4 chunky-border">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2">PDF</p>
            {exportFonts.length > 0 && (
              <select value={exportFont} onChange={(e) => setExportFont(e.target.value)} className="mb-3 w-full rounded-xl bg-background px-3 py-2 text-sm font-bold chunky-border focus:outline-none focus:ring-2 focus:ring-primary/40">
                {exportFonts.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            )}
            <button onClick={handlePdf} disabled={downloadingPdf} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-extrabold text-background chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0">
              {downloadingPdf ? <><XsSpinner /> Generating PDF…</> : <><Download className="h-4 w-4" strokeWidth={2.5} /> Download PDF</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

import { useRequireAuth } from "@/lib/use-require-auth";

// Shown the moment every page finishes illustrating — offers the three voice paths.
function VoicePromptModal({ onSkip, onDefault, onOwn }: { onSkip: () => void; onDefault: () => void; onOwn: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onSkip}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-card p-7 chunky-border chunky-shadow text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary chunky-border chunky-shadow-sm">
          <Volume2 className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <h2 className="font-display text-2xl font-black">Congratulations! 🎉</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your storybook is ready. Do you want to add a voice to it?</p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button onClick={onDefault} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
            <Mic className="h-4 w-4" strokeWidth={2.5} /> Give default voice
          </button>
          <button onClick={onOwn} className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-extrabold text-accent-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
            <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Add your own voice
          </button>
          <button onClick={onSkip} className="inline-flex items-center justify-center gap-2 rounded-full bg-card px-5 py-2.5 text-sm font-extrabold text-muted-foreground chunky-border hover:-translate-y-0.5 transition-transform">
            Skip it
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EditorPage() {
  useRequireAuth();
  const { token } = useAuth();
  const { book, mergePages, setBook } = useBook();
  const { sub: subInfo } = useSubscription();
  const narrationAllowed = subInfo === null ? true : subInfo.narration;
  const lastSaved = useRelativeTime(book?.updated_at);

  const router = useRouter();
  const [showExport, setShowExport] = useState(false);
  const [showVoicePrompt, setShowVoicePrompt] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [pageElapsed, setPageElapsed] = useState<Record<string, number>>({});

  const job = useIllJob(book?.id);
  // Treat an aborted job as no-longer-running so the UI returns to idle the
  // instant Stop is clicked, even while the last in-flight requests settle.
  const isRunning = !!job && !job.aborted && job.done < job.total;

  // Live elapsed derived from the job's start time (module-level, survives leaving
  // and returning), so the timer is always accurate — not reset to 0 on remount.
  const [, tickElapsed] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => tickElapsed(), 1000);
    return () => clearInterval(id);
  }, [isRunning]);
  const jobElapsedSec = job ? Math.max(0, Math.floor((Date.now() - job.started) / 1000)) : 0;
  const jobElapsedFmt = jobElapsedSec >= 60
    ? `${Math.floor(jobElapsedSec / 60)}m ${(jobElapsedSec % 60).toString().padStart(2, "0")}s`
    : `${jobElapsedSec}s`;

  const pageStatuses: Record<string, PageIllStatus> = {};
  if (job) { for (const [id, s] of Object.entries(job.pageStatuses)) { pageStatuses[id] = s; } }

  useEffect(() => { _onPageDone = (page: PageOut) => mergePages([page]); }, [mergePages]);

  // Narration
  const [narratingBook, setNarratingBook] = useState(false);
  const [narrateProgress, setNarrateProgress] = useState<{ done: number; total: number } | null>(null);
  const narrateCancelledRef = useRef(false);
  const [pageNarrateStatuses, setPageNarrateStatuses] = useState<Record<string, "idle" | "narrating" | "done" | "error">>({});
  type VoiceChoice = { type: "preset"; id: string } | { type: "clone"; profileId: string; name: string };
  const [selectedVoice, setSelectedVoice] = useState<VoiceChoice>({ type: "preset", id: "" });
  const [availableVoices, setAvailableVoices] = useState<Array<{ id: string; name: string; description: string; is_default: boolean }>>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);

  useEffect(() => {
    if (!token) return;
    api.books.listVoices(token).then((res) => {
      if (res.voices?.length) {
        setAvailableVoices(res.voices);
        const def = res.voices.find((v) => v.is_default) ?? res.voices[0];
        setSelectedVoice((cur) => (cur.type === "preset" && res.voices.some((v) => v.id === cur.id) ? cur : { type: "preset", id: def.id }));
      }
    }).catch(() => {});
    api.voices.list(token).then(setVoiceProfiles).catch(() => {});
  }, [token]);

  // Pictures start automatically on entering the stage — no button needed. Runs once
  // per visit; if every page already has a picture, or a run is active, it stays idle.
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (autoStarted || !token || !book) return;
    const total = book.pages.length;
    const illustrated = book.pages.filter((p) => p.has_image).length;
    if (total === 0 || illustrated === total || isRunning) return;
    setAutoStarted(true);
    handleIllustrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStarted, token, book?.id, isRunning]);

  // Per-page timers
  const pageTimerRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  function startPageTimer(pageId: string) {
    setPageElapsed((prev) => ({ ...prev, [pageId]: 0 }));
    pageTimerRefs.current[pageId] = setInterval(() => {
      setPageElapsed((prev) => ({ ...prev, [pageId]: (prev[pageId] ?? 0) + 1 }));
    }, 1000);
  }
  function stopPageTimer(pageId: string) {
    if (pageTimerRefs.current[pageId]) { clearInterval(pageTimerRefs.current[pageId]); delete pageTimerRefs.current[pageId]; }
  }

  // Fetch ground truth once and snap the store to it — used to reconcile after
  // a batch job so the final state can't be left wrong by out-of-order responses.
  const reconcileBook = useCallback(async () => {
    if (!token || !book) return;
    try {
      const fresh = await api.books.get(token, book.id);
      setBook(fresh);
    } catch { /* non-fatal — per-page merges already reflect the truth */ }
  }, [token, book, setBook]);

  async function handleIllustrate() {
    if (!token || !book || isRunning) return;
    setShowEstimate(true);
    // Mark that pictures have started so "continue" routes here (not to review).
    api.books.markIllustrating(token, book.id).catch(() => {});
    const { failedCount, aborted } = await startIllJob(
      token,
      book,
      (page) => mergePages([page]),
      reconcileBook,
    );
    if (aborted) {
      toast("Stopped illustrating.");
    } else if (failedCount > 0) {
      toast.error(`${failedCount} page${failedCount > 1 ? "s" : ""} failed — click Make the pictures to retry`);
    } else {
      toast.success("All pictures complete!");
      setShowVoicePrompt(true);
    }
  }

  async function handleGenerateSingle(page: PageOut) {
    if (!token || !book || isRunning) return;
    startPageTimer(page.id);
    try {
      const updated = page.is_back_cover
        ? await api.books.illustrateBackCover(token, book.id)
        : await api.books.illustratePage(token, book.id, page.id);
      bustAuthImageCache(pageImageUrl(book.id, page.id));
      const freshPage = updated.pages.find((p) => p.id === page.id);
      if (freshPage) mergePages([freshPage]);
    } catch (e: any) { toast.error(`Page ${page.order} failed: ${e.message ?? "Unknown error"}`); }
    finally { stopPageTimer(page.id); }
  }

  async function handleNarrate() {
    if (!token || !book) return;
    const textPages = book.pages.filter((p) => p.text);
    if (textPages.length === 0) { toast("No pages with text."); return; }
    narrateCancelledRef.current = false;
    setNarratingBook(true);
    setNarrateProgress({ done: 0, total: textPages.length });
    try {
      for (const page of textPages) {
        if (narrateCancelledRef.current) break;
        const updated = await api.books.narratePage(
          token, book.id, page.id,
          selectedVoice.type === "preset" ? selectedVoice.id : undefined,
          selectedVoice.type === "clone" ? selectedVoice.profileId : undefined,
        );
        const freshPage = updated.pages.find((p) => p.id === page.id);
        if (freshPage) mergePages([freshPage]);
        setNarrateProgress((p) => p ? { ...p, done: p.done + 1 } : null);
      }
      if (!narrateCancelledRef.current) toast.success("Narration complete!");
    } catch (err) { if (!narrateCancelledRef.current) toast.error(err instanceof Error ? err.message : "Narration failed — please try again."); }
    finally { setNarratingBook(false); setNarrateProgress(null); }
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
      const freshPage = updated.pages.find((p) => p.id === page.id);
      if (freshPage) mergePages([freshPage]);
      setPageNarrateStatuses((s) => ({ ...s, [page.id]: "done" }));
    } catch (err) {
      setPageNarrateStatuses((s) => ({ ...s, [page.id]: "error" }));
      toast.error(err instanceof Error ? err.message : "Narration failed for this page — please try again.");
    }
  }

  if (!book) return <main className="mx-auto max-w-7xl px-4 py-10"><NoBook /></main>;

  const allPages = [...book.pages].sort((a, b) => a.order - b.order);
  const illustratedCount = allPages.filter((p) => p.has_image).length;
  const totalCount = allPages.length;
  const allDone = illustratedCount === totalCount && totalCount > 0;
  // While a run is active the counter/bar reflect the CURRENT job (0/N and up),
  // not the stale ground-truth from a previous completed run.
  const progressDone = isRunning ? (job?.done ?? 0) : illustratedCount;
  const progressTotal = isRunning ? (job?.total ?? totalCount) : totalCount;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <LeaveGuard
        active={isRunning || !!job?.sheetsGenerating}
        title="Leave while it finishes?"
        message="Your pictures keep being made — you can safely leave."
        subMessage="Each page is saved as it finishes, and you'll find this book under In Progress in My Books to finish the rest where you left off."
      />
      {showExport && <ExportModal book={book as BookOut} token={token} onClose={() => setShowExport(false)} />}
      {showEstimate && (
        <EstimatePopup title="Drawing your pictures! 🎨✨" estimateSeconds={estimateIllustrationSeconds(totalCount)} onClose={() => setShowEstimate(false)} />
      )}
      {showVoicePrompt && (
        <VoicePromptModal
          onSkip={() => setShowVoicePrompt(false)}
          onDefault={() => router.push("/narrate?guide=default")}
          onOwn={() => router.push("/voices")}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        {/* Storybook journey — Pictures is this (editor) step */}
        <div className="mb-4 flex justify-center">
          <StepBar currentIdx={4} />
        </div>
        <div className="flex items-center justify-between mb-4">
          <Link href="/create" className="inline-flex items-center gap-1.5 rounded-full bg-card px-4 py-2 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Back
          </Link>
          {/* Read / Parent mode / Export actions removed here — the finished-book card below carries Read my Storybook */}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-black md:text-5xl">Pictures</h1>
            <p className="mt-1 text-muted-foreground">
              {progressDone} of {progressTotal} pages illustrated
              {book.brief && <span className="ml-2 font-semibold text-foreground">· {book.brief.title}</span>}
            </p>
            {progressTotal > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 w-48 overflow-hidden rounded-full bg-muted chunky-border">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(progressDone / progressTotal) * 100}%` }} />
                </div>
                {!isRunning && lastSaved && <span className="text-xs font-bold text-muted-foreground">Saved {lastSaved}</span>}
              </div>
            )}
          </div>
          {isRunning && (
            <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-2.5 chunky-border shrink-0">
              <Clock className="h-4 w-4 text-primary animate-pulse" />
              <span className="font-display text-xl font-black tabular-nums">{jobElapsedFmt}</span>
            </div>
          )}
        </div>
      </div>

      {/* Finished-book celebration — top of stage; only when every page is done, hidden while a remake runs */}
      {allDone && !isRunning && (
        <div className="mb-6 flex flex-col items-center gap-4 rounded-3xl bg-card p-8 chunky-border text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary chunky-border chunky-shadow-sm">
            <BookOpen className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="font-display text-3xl font-black">Congratulations! 🎉</h2>
            <p className="mt-1 text-muted-foreground text-sm">Your storybook is ready.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/reader?from=editor" className="inline-flex animate-bounce items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform">
              <Eye className="h-5 w-5" strokeWidth={2.5} /> Read my Storybook
            </Link>
            {narrationAllowed ? (
              <Link href="/narrate" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-base font-extrabold text-accent-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
                <Mic className="h-5 w-5" strokeWidth={2.5} /> Add Voice →
              </Link>
            ) : (
              <Link href="/pricing" title="Narration is a Studio feature" className="inline-flex items-center gap-2 rounded-full bg-muted px-6 py-3.5 text-base font-extrabold text-muted-foreground chunky-border hover:-translate-y-0.5 transition-transform">
                🔒 Add Voice <span className="text-xs font-black">(Studio)</span>
              </Link>
            )}
            <button onClick={handleIllustrate} className="inline-flex items-center gap-2 rounded-full bg-card px-5 py-3 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">
              <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Remake pictures
            </button>
          </div>
        </div>
      )}

      {/* Original prompt */}
      {book.raw_prompt && (
        <details className="group mb-4">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-extrabold text-muted-foreground hover:text-foreground transition-colors w-fit">
            <span className="transition-transform group-open:rotate-90">›</span> Your original idea
          </summary>
          <div className="mt-2 rounded-2xl bg-card px-4 py-3 chunky-border">
            <p className="text-sm italic text-foreground/70 leading-relaxed">"{book.raw_prompt}"</p>
          </div>
        </details>
      )}

      {/* Picture generation status — pictures start automatically; this bar shows progress + Stop
          while generating, and a Continue button only if a run was interrupted. */}
      {(isRunning || job?.sheetsGenerating) ? (
        <div data-tour="editor-illustrate" className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl bg-card p-4 chunky-border">
          <div className="flex-1 min-w-0">
            {job?.sheetsGenerating ? (
              <div className="flex items-center gap-2"><SmSpinner /><p className="text-sm font-extrabold">Generating character sheets for consistency…</p></div>
            ) : (
              <div>
                <div className="flex items-center gap-2"><SmSpinner /><p className="text-sm font-extrabold">Drawing {job?.done ?? 0} of {job?.total ?? totalCount} pictures… <span className="ml-1.5 font-semibold text-muted-foreground text-xs">You can switch tabs — it keeps going.</span></p></div>
                <p className="text-xs font-bold text-muted-foreground mt-1 ml-7">⏳ This should take {estimateLabel(estimateIllustrationSeconds(job?.total ?? totalCount))}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Live elapsed timer — counts forward until generation ends */}
            <div className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 chunky-border">
              <Clock className="h-4 w-4 text-primary animate-pulse" strokeWidth={2.5} />
              <span className="font-display text-lg font-black tabular-nums">{jobElapsedFmt}</span>
            </div>
            <button onClick={() => stopIllJob(book.id)} className="inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-sm font-extrabold text-destructive-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
              <StopIcon className="h-4 w-4" strokeWidth={3} /> Stop{isRunning ? ` (${job?.done ?? illustratedCount}/${job?.total ?? totalCount})` : ""}
            </button>
          </div>
        </div>
      ) : autoStarted && !allDone && totalCount > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl bg-card p-4 chunky-border">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold">Picture generation paused</p>
            <p className="text-xs text-muted-foreground mt-0.5">{illustratedCount} of {totalCount} pages have pictures — continue to finish the rest.</p>
          </div>
          <button onClick={handleIllustrate} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
            <Sparkles className="h-4 w-4" strokeWidth={3} /> Continue pictures
          </button>
        </div>
      ) : null}

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
