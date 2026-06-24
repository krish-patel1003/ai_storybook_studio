"use client";

import {
  useState, useEffect, useRef, useCallback, useReducer, Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Download, Mic, Sparkles, RefreshCw, Play, Pause,
  Square as StopIcon, Volume2, Check, Minus, Plus, AlignLeft,
  AlignCenter, AlignRight, ChevronLeft, ChevronRight, ImageIcon,
  Layers, Paintbrush, Grid3X3,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import {
  api, pageImageUrl,
  type PageOut, type BookOut, type CanvasOverlay, type TextAlign, type TextPosition,
} from "@/lib/api";
import { useAuthImage } from "@/lib/use-auth-image";
import { READER_FONTS, type FontId } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { XsSpinner, SmSpinner, LgSpinner } from "@/components/character-spinner";

// ── Module-level illustration job ──────────────────────────────────────────────

type IllStatus = "idle" | "pending" | "done" | "error";

interface IllJob {
  bookId: string;
  statuses: Record<string, IllStatus>;
  done: number;
  total: number;
}

let _job: IllJob | null = null;
const _listeners = new Set<() => void>();
function _notifyJob() { _listeners.forEach(fn => fn()); }

async function startIllJob(
  token: string,
  book: BookOut,
  onUpdate: (b: BookOut) => void,
) {
  const pages = book.pages.filter(p => !p.is_cover);
  _job = {
    bookId: book.id,
    statuses: Object.fromEntries(pages.map(p => [p.id, "pending" as IllStatus])),
    done: 0,
    total: pages.length,
  };
  _notifyJob();

  await Promise.allSettled(
    pages.map(async (page) => {
      try {
        const updated = await api.books.illustratePage(token, book.id, page.id);
        onUpdate(updated);
        if (_job?.bookId === book.id) {
          _job.statuses[page.id] = "done";
          _job.done++;
          _notifyJob();
        }
      } catch {
        if (_job?.bookId === book.id) {
          _job.statuses[page.id] = "error";
          _job.done++;
          _notifyJob();
        }
      }
    }),
  );

  setTimeout(() => {
    if (_job?.bookId === book.id) { _job = null; _notifyJob(); }
  }, 4000);
}

function useIllJob(bookId: string) {
  const [job, setJob] = useState<IllJob | null>(_job);
  useEffect(() => {
    const fn = () => setJob(_job ? { ..._job, statuses: { ..._job.statuses } } : null);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return job?.bookId === bookId ? job : null;
}

// ── Book-level text settings (localStorage) ───────────────────────────────────

type TextMode = 1 | 2 | 3;

interface BookTextSettings {
  mode: TextMode;
  fontSize: number;
  fontFamily: FontId;
  textColor: string;
  // Mode 1 – overlay
  m1Position: TextPosition;
  m1Align: TextAlign;
  m1BgStyle: "none" | "frosted" | "darkened";
  m1BgOpacity: number;
  // Mode 2 – stacked
  m2Position: "bottom" | "top";
  m2BgColor: string;
}

const DEFAULT_SETTINGS: BookTextSettings = {
  mode: 1,
  fontSize: 14,
  fontFamily: "unkempt",
  textColor: "#1a1a2e",
  m1Position: "bottom",
  m1Align: "center",
  m1BgStyle: "frosted",
  m1BgOpacity: 0.82,
  m2Position: "bottom",
  m2BgColor: "#faf8f3",
};

function loadSettings(bookId: string): BookTextSettings {
  try {
    const raw = localStorage.getItem(`studio-settings-${bookId}`);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(bookId: string, s: BookTextSettings) {
  try { localStorage.setItem(`studio-settings-${bookId}`, JSON.stringify(s)); } catch {}
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXT_COLORS = [
  "#1a1a2e", "#ffffff", "#fff7ed", "#1e3a5f",
  "#7c3aed", "#dc2626", "#0f766e", "#92400e",
];

const MIN_W = 0.08;
const MIN_H = 0.05;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ── Page thumbnail ─────────────────────────────────────────────────────────────

function PageThumb({
  page, bookId, token, isActive, illStatus, onClick,
}: {
  page: PageOut; bookId: string; token: string;
  isActive: boolean; illStatus?: IllStatus; onClick: () => void;
}) {
  const blobUrl = useAuthImage(pageImageUrl(bookId, page.id), token, page.has_image);
  const pending = illStatus === "pending";
  const errored = illStatus === "error";

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full overflow-hidden rounded-xl border-[2.5px] transition-all hover:scale-[1.02]",
        isActive ? "border-primary shadow-md scale-[1.02]" : "border-foreground/20 hover:border-foreground/40"
      )}
    >
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {blobUrl ? (
          <img src={blobUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : pending ? (
          <div className="flex h-full items-center justify-center bg-primary/5">
            <SmSpinner />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground/30" strokeWidth={1.5} />
          </div>
        )}
        {errored && (
          <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
            <span className="text-xs font-extrabold text-destructive">!</span>
          </div>
        )}
        <div className={cn(
          "absolute bottom-0 inset-x-0 py-0.5 text-center text-[9px] font-extrabold",
          isActive ? "bg-primary text-primary-foreground" : "bg-black/50 text-white"
        )}>
          {page.is_cover ? "Cover" : `p.${page.order}`}
          {page.has_audio && <span className="ml-1 opacity-70">♪</span>}
        </div>
      </div>
    </button>
  );
}

// ── Center: Mode 1 preview (overlay) ──────────────────────────────────────────

type DragHandle = "move" | "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

function Mode1Preview({
  blobUrl, text, settings, canvasRef, onSettingsChange,
}: {
  blobUrl: string | null;
  text: string;
  settings: BookTextSettings;
  canvasRef: React.RefObject<HTMLDivElement>;
  onSettingsChange: (patch: Partial<BookTextSettings>) => void;
}) {
  // Compute overlay position from settings (fixed zone at bottom/center/top)
  const zoneH = 0.36;
  const yMap: Record<TextPosition, number> = { bottom: 1 - zoneH, center: (1 - zoneH) / 2, top: 0 };
  const overlayY = yMap[settings.m1Position];
  const font = READER_FONTS.find(f => f.id === settings.fontFamily) ?? READER_FONTS[0];

  const bg: React.CSSProperties =
    settings.m1BgStyle === "none"     ? {} :
    settings.m1BgStyle === "frosted"  ? { backdropFilter: "blur(14px) saturate(1.4)", backgroundColor: `rgba(255,255,255,${settings.m1BgOpacity * 0.82})` } :
    { backgroundColor: `rgba(0,0,0,${settings.m1BgOpacity})` };

  return (
    <div ref={canvasRef} className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow"
      style={{ width: "min(640px, calc(100vw - 520px))", aspectRatio: "4/3", flexShrink: 0 }}>
      {blobUrl ? (
        <img src={blobUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <ImageIcon className="h-16 w-16 text-muted-foreground/20" strokeWidth={1} />
        </div>
      )}
      {/* Text zone */}
      <div style={{
        position: "absolute",
        left: "3%", top: `${overlayY * 100}%`,
        width: "94%", height: `${zoneH * 100}%`,
        ...bg, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "8px 14px",
      }}>
        <p style={{
          margin: 0, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word",
          fontFamily: font.stack, fontWeight: font.weight,
          fontSize: settings.fontSize, color: settings.textColor,
          textAlign: settings.m1Align, lineHeight: 1.35,
        }}>
          {text || <span style={{ opacity: 0.3, fontStyle: "italic" }}>No text yet</span>}
        </p>
      </div>
    </div>
  );
}

// ── Center: Mode 2 preview (stacked) ──────────────────────────────────────────

function Mode2Preview({
  blobUrl, text, settings,
}: {
  blobUrl: string | null;
  text: string;
  settings: BookTextSettings;
}) {
  const font = READER_FONTS.find(f => f.id === settings.fontFamily) ?? READER_FONTS[0];
  const isTextBottom = settings.m2Position === "bottom";

  const imgBlock = (
    <div className="relative" style={{ flex: "0 0 63%" }}>
      {blobUrl ? (
        <img src={blobUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="h-full bg-muted flex items-center justify-center">
          <ImageIcon className="h-12 w-12 text-muted-foreground/20" strokeWidth={1} />
        </div>
      )}
      {/* Gradient blending edge */}
      <div style={{
        position: "absolute",
        [isTextBottom ? "bottom" : "top"]: 0,
        left: 0, right: 0, height: "38%",
        background: `linear-gradient(${isTextBottom ? "to bottom" : "to top"}, ${settings.m2BgColor}, transparent)`,
      }} />
    </div>
  );

  const textBlock = (
    <div style={{
      flex: 1, background: settings.m2BgColor,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "10px 16px",
    }}>
      <p style={{
        margin: 0, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word",
        fontFamily: font.stack, fontWeight: font.weight,
        fontSize: settings.fontSize, color: settings.textColor,
        textAlign: "center", lineHeight: 1.35,
      }}>
        {text || <span style={{ opacity: 0.3, fontStyle: "italic" }}>No text yet</span>}
      </p>
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow"
      style={{
        width: "min(640px, calc(100vw - 520px))", aspectRatio: "4/3",
        flexShrink: 0, display: "flex",
        flexDirection: isTextBottom ? "column" : "column-reverse",
      }}>
      {imgBlock}
      {textBlock}
    </div>
  );
}

// ── Center: Mode 3 preview (canvas / drag-resize) ─────────────────────────────

function Mode3Preview({
  blobUrl, text, overlay, canvasRef,
  onMoveStart, onHandleStart,
}: {
  blobUrl: string | null;
  text: string;
  overlay: CanvasOverlay;
  canvasRef: React.RefObject<HTMLDivElement>;
  onMoveStart: (e: React.MouseEvent) => void;
  onHandleStart: (e: React.MouseEvent, h: DragHandle) => void;
}) {
  const font = READER_FONTS.find(f => f.id === overlay.fontFamily) ?? READER_FONTS[0];

  const bg: React.CSSProperties =
    overlay.bgStyle === "none"     ? {} :
    overlay.bgStyle === "frosted"  ? { backdropFilter: "blur(14px)", backgroundColor: `rgba(255,255,255,${overlay.bgOpacity * 0.82})` } :
    { backgroundColor: `rgba(0,0,0,${overlay.bgOpacity})` };

  const HANDLES: { id: DragHandle; s: React.CSSProperties; cursor: string }[] = [
    { id: "tl", s: { top: -5, left: -5 },                   cursor: "nw-resize" },
    { id: "t",  s: { top: -5, left: "calc(50% - 5px)" },    cursor: "n-resize"  },
    { id: "tr", s: { top: -5, right: -5 },                  cursor: "ne-resize" },
    { id: "r",  s: { top: "calc(50% - 5px)", right: -5 },   cursor: "e-resize"  },
    { id: "br", s: { bottom: -5, right: -5 },               cursor: "se-resize" },
    { id: "b",  s: { bottom: -5, left: "calc(50% - 5px)" }, cursor: "s-resize"  },
    { id: "bl", s: { bottom: -5, left: -5 },                cursor: "sw-resize" },
    { id: "l",  s: { top: "calc(50% - 5px)", left: -5 },    cursor: "w-resize"  },
  ];

  return (
    <div ref={canvasRef} className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow"
      style={{ width: "min(640px, calc(100vw - 520px))", aspectRatio: "4/3", flexShrink: 0 }}>
      {blobUrl ? (
        <img src={blobUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <ImageIcon className="h-16 w-16 text-muted-foreground/20" strokeWidth={1} />
        </div>
      )}
      {/* Draggable text box */}
      <div
        style={{
          position: "absolute",
          left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%`,
          width: `${overlay.w * 100}%`, height: `${overlay.h * 100}%`,
          cursor: "move", userSelect: "none",
        }}
        onMouseDown={onMoveStart}
      >
        <div style={{ position: "absolute", inset: 0, borderRadius: 8, ...bg }} />
        <div style={{
          position: "relative", zIndex: 1, height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "8px 14px", overflow: "hidden",
          fontFamily: font.stack, fontWeight: font.weight,
          fontSize: overlay.fontSize, color: overlay.textColor,
          textAlign: "center", lineHeight: 1.3,
        }}>
          <p style={{ margin: 0, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {text || <span style={{ opacity: 0.3, fontStyle: "italic" }}>No text</span>}
          </p>
        </div>
        {/* Selection ring */}
        <div style={{
          position: "absolute", inset: 0,
          border: "2px dashed oklch(0.7 0.18 35)",
          borderRadius: 8, pointerEvents: "none",
        }} />
        {HANDLES.map(({ id, s, cursor }) => (
          <div key={id}
            style={{
              position: "absolute", width: 11, height: 11,
              background: "oklch(0.99 0.01 85)",
              border: "2.5px solid oklch(0.7 0.18 35)",
              borderRadius: 3, cursor, zIndex: 20, ...s,
            }}
            onMouseDown={e => { e.stopPropagation(); onHandleStart(e, id); }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Right panel section label ──────────────────────────────────────────────────

function SL({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2">{children}</p>;
}

// ── Audio preview hook ────────────────────────────────────────────────────────

function useAudioPreview(bookId: string, pageId: string, token: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    if (!token) return;
    setLoading(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/books/${bookId}/pages/${pageId}/audio`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src); }
      const audio = new Audio(objUrl);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      await audio.play();
      setPlaying(true);
    } catch { toast.error("Could not load audio"); }
    finally { setLoading(false); }
  }

  useEffect(() => () => { audioRef.current?.pause(); }, []);
  return { playing, loading, toggle };
}

// ── Default canvas overlay ─────────────────────────────────────────────────────

const DEFAULT_OVERLAY: CanvasOverlay = {
  x: 0.03, y: 0.66, w: 0.94, h: 0.30,
  fontSize: 14, fontFamily: "unkempt",
  textColor: "#1a1a2e", bgStyle: "frosted", bgOpacity: 0.82,
};

// ── Narrate modal ──────────────────────────────────────────────────────────────

function NarrateModal({
  token, book, onUpdate, onClose,
}: {
  token: string; book: BookOut;
  onUpdate: (b: BookOut) => void;
  onClose: () => void;
}) {
  const [voices, setVoices] = useState<{ id: string; description: string }[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.books.listVoices(token).then(r => {
      setVoices(r.voices ?? []);
      const def = r.voices?.find(v => v.is_default);
      if (def) setVoiceId(def.id);
    }).catch(() => {});
  }, [token]);

  async function run() {
    const pages = book.pages.filter(p => !p.is_cover && !!p.text);
    setRunning(true);
    setProgress(0);
    for (let i = 0; i < pages.length; i++) {
      try {
        const updated = await api.books.narratePage(token, book.id, pages[i].id, voiceId || undefined);
        onUpdate(updated);
      } catch {}
      setProgress(i + 1);
    }
    setRunning(false);
    toast.success("Narration complete!");
    onClose();
  }

  const pages = book.pages.filter(p => !p.is_cover && !!p.text);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 chunky-border chunky-shadow"
        onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-black mb-4">Narrate all pages</h2>
        {voices.length > 0 && (
          <div className="mb-4">
            <SL>Voice</SL>
            <div className="space-y-1.5">
              {voices.map(v => (
                <button key={v.id} onClick={() => setVoiceId(v.id)}
                  className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm chunky-border transition-colors",
                    voiceId === v.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                  <Volume2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  {v.description}
                </button>
              ))}
            </div>
          </div>
        )}
        {running && (
          <div className="mb-4">
            <div className="h-2 w-full rounded-full bg-muted chunky-border overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(progress / pages.length) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground font-bold">
              {progress} / {pages.length} pages
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={running}
            className="flex-1 rounded-full py-2 text-sm font-extrabold chunky-border hover:bg-muted transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={run} disabled={running}
            className="flex-1 rounded-full bg-primary py-2 text-sm font-extrabold text-primary-foreground chunky-border hover:opacity-90 transition-opacity disabled:opacity-50">
            {running ? <span className="flex items-center justify-center gap-1"><XsSpinner /> Narrating…</span> : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Export modal (lightweight, same as editor) ─────────────────────────────────

function ExportModal({ book, token, onClose }: { book: BookOut; token: string; onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  async function dl(type: "pdf" | "epub" | "cover") {
    setLoading(true);
    try {
      const res = type === "pdf"   ? await api.books.exportPdf(token, book.id, "unkempt")
                : type === "cover" ? await api.books.exportCoverPdf(token, book.id)
                :                    await api.books.exportEpub(token, book.id, "unkempt");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const name = (book.brief?.title ?? book.title).replace(/\s+/g, "_");
      const ext  = type === "epub" ? "epub" : "pdf";
      const suf  = type === "cover" ? "_cover" : "";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}${suf}.${ext}`;
      a.click();
    } catch { toast.error("Export failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 chunky-border chunky-shadow" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-black mb-4">Export</h2>
        <div className="space-y-2">
          {[
            { id: "pdf"  as const, label: "Full Book PDF",  desc: "Print-ready A5 with all pages" },
            { id: "cover"as const, label: "Cover PDF",       desc: "Single cover page for Amazon" },
            { id: "epub" as const, label: "Amazon Kindle",   desc: "Reflowable e-book" },
          ].map(opt => (
            <button key={opt.id} onClick={() => dl(opt.id)} disabled={loading}
              className="flex w-full items-center gap-3 rounded-2xl bg-background px-4 py-3 chunky-border hover:bg-muted transition-colors disabled:opacity-50 text-left">
              <Download className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
              <div>
                <p className="text-sm font-extrabold">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
        {loading && <p className="mt-3 text-center text-xs text-muted-foreground font-bold flex items-center justify-center gap-1"><XsSpinner /> Generating…</p>}
      </div>
    </div>
  );
}

// ── Main Studio page ──────────────────────────────────────────────────────────

function StudioInner() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const { token }     = useAuth();
  const { book, setBook } = useBook();

  const [pageIdx,  setPageIdx]  = useState(0);
  const [text,     setText]     = useState("");
  const [settings, setSettings] = useState<BookTextSettings>(DEFAULT_SETTINGS);
  const [overlay,  setOverlay]  = useState<CanvasOverlay>(DEFAULT_OVERLAY);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);

  const [illustrating, setIllustrating]  = useState(false);
  const [reIllLoading, setReIllLoading]  = useState(false);
  const [narrateModal, setNarrateModal]  = useState(false);
  const [exportModal,  setExportModal]   = useState(false);

  const canvasRef  = useRef<HTMLDivElement>(null);
  const dragRef    = useRef<{ handle: DragHandle; sx: number; sy: number; snap: CanvasOverlay } | null>(null);
  const latestRef  = useRef({ text, overlay, settings });
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pages = book?.pages ?? [];
  const page  = pages[pageIdx] ?? null;
  const illJob = useIllJob(book?.id ?? "");

  // Load settings from localStorage when book loads
  useEffect(() => {
    if (!book) return;
    setSettings(loadSettings(book.id));
  }, [book?.id]);

  // Sync page data when switching
  useEffect(() => {
    if (!page) return;
    setText(page.text ?? "");
    const ov = page.canvas_overlay;
    setOverlay(ov ? { ...DEFAULT_OVERLAY, ...ov } : { ...DEFAULT_OVERLAY, fontSize: settings.fontSize, fontFamily: settings.fontFamily, textColor: settings.textColor });
    setDirty(false);
  }, [pageIdx, page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep latestRef in sync
  useEffect(() => { latestRef.current = { text, overlay, settings }; });

  // Auto-start illustration if coming from outline
  useEffect(() => {
    if (searchParams.get("illustrating") !== "true") return;
    if (!token || !book) return;
    window.history.replaceState({}, "", "/studio");
    setIllustrating(true);
    startIllJob(token, book, b => setBook(b))
      .then(() => { setIllustrating(false); toast.success("All pages illustrated!"); })
      .catch(() => setIllustrating(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave
  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 1400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (!token || !book || !page) return;
    const { text: tx, overlay: ov, settings: st } = latestRef.current;

    // Decide what overlay to save based on mode
    let overlayToSave: CanvasOverlay | null = null;
    if (st.mode === 1) {
      overlayToSave = {
        ...ov,
        fontSize: st.fontSize,
        fontFamily: st.fontFamily,
        textColor: st.textColor,
        bgStyle: st.m1BgStyle,
        bgOpacity: st.m1BgOpacity,
      };
    } else if (st.mode === 2) {
      // Store stacked info in overlay fields
      overlayToSave = {
        ...DEFAULT_OVERLAY,
        fontSize: st.fontSize,
        fontFamily: st.fontFamily,
        textColor: st.textColor,
        bgStyle: ("stacked-" + st.m2Position) as CanvasOverlay["bgStyle"],
        bgOpacity: 1,
      };
    } else {
      overlayToSave = { ...ov };
    }

    setSaving(true);
    try {
      const updated = await api.books.updatePage(token, book.id, page.id, {
        text: tx,
        text_align: st.m1Align,
        text_position: st.m1Position,
        canvas_overlay: overlayToSave,
      });
      setBook(updated as unknown as BookOut);
      setDirty(false);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  }, [token, book?.id, page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchSettings(patch: Partial<BookTextSettings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      if (book) saveSettings(book.id, next);
      return next;
    });
    setDirty(true);
  }

  function switchPage(idx: number) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (dirty) save();
    setPageIdx(idx);
  }

  // ── Canvas drag/resize (Mode 3) ────────────────────────────────────────────

  function startInteraction(e: React.MouseEvent, handle: DragHandle) {
    e.preventDefault();
    dragRef.current = { handle, sx: e.clientX, sy: e.clientY, snap: { ...overlay } };

    function onMove(ev: MouseEvent) {
      const dr = dragRef.current;
      if (!dr || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = (ev.clientX - dr.sx) / rect.width;
      const dy = (ev.clientY - dr.sy) / rect.height;
      const s  = dr.snap;
      let { x, y, w, h } = s;

      switch (dr.handle) {
        case "move": x = clamp(s.x + dx, 0, 1 - s.w); y = clamp(s.y + dy, 0, 1 - s.h); break;
        case "br":   w = clamp(s.w + dx, MIN_W, 1 - s.x); h = clamp(s.h + dy, MIN_H, 1 - s.y); break;
        case "bl": { const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_W); w = s.x + s.w - nx; x = nx; h = clamp(s.h + dy, MIN_H, 1 - s.y); break; }
        case "tr": { const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_H); h = s.y + s.h - ny; y = ny; w = clamp(s.w + dx, MIN_W, 1 - s.x); break; }
        case "tl": { const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_W); const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_H); w = s.x + s.w - nx; x = nx; h = s.y + s.h - ny; y = ny; break; }
        case "r":  w = clamp(s.w + dx, MIN_W, 1 - s.x); break;
        case "l":  { const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_W); w = s.x + s.w - nx; x = nx; break; }
        case "b":  h = clamp(s.h + dy, MIN_H, 1 - s.y); break;
        case "t":  { const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_H); h = s.y + s.h - ny; y = ny; break; }
      }
      setOverlay(prev => ({ ...prev, x, y, w, h }));
    }

    function onUp() {
      dragRef.current = null;
      setDirty(true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Per-page re-illustrate ─────────────────────────────────────────────────

  async function reIllustrate() {
    if (!token || !book || !page) return;
    setReIllLoading(true);
    try {
      const updated = await api.books.illustratePage(token, book.id, page.id);
      setBook(updated as unknown as BookOut);
      toast.success("Re-illustrated!");
    } catch { toast.error("Illustration failed"); }
    finally { setReIllLoading(false); }
  }

  // ── Per-page re-narrate ────────────────────────────────────────────────────

  const [narratingPage, setNarratingPage] = useState(false);
  async function reNarrate() {
    if (!token || !book || !page) return;
    setNarratingPage(true);
    try {
      const updated = await api.books.narratePage(token, book.id, page.id);
      setBook(updated as unknown as BookOut);
      toast.success("Narrated!");
    } catch { toast.error("Narration failed"); }
    finally { setNarratingPage(false); }
  }

  const audio = useAudioPreview(book?.id ?? "", page?.id ?? "", token ?? null);

  // ── Image ──────────────────────────────────────────────────────────────────

  const imgUrl  = page ? pageImageUrl(book!.id, page.id) : "";
  const blobUrl = useAuthImage(imgUrl, token ?? null, !!page?.has_image);

  const illustrated = pages.filter(p => !p.is_cover && p.has_image).length;
  const total       = pages.filter(p => !p.is_cover).length;

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!book) {
    return (
      <div className="flex h-screen items-center justify-center text-center px-4">
        <div>
          <p className="text-2xl font-display font-black mb-2">No book loaded</p>
          <button onClick={() => router.push("/library")}
            className="mt-4 rounded-full bg-primary px-5 py-2.5 font-extrabold text-primary-foreground chunky-border">
            Go to Library
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden select-none">

      {/* ── Top bar ── */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b-[2.5px] border-foreground bg-card px-4">
        <button onClick={() => router.push("/outline")}
          className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Outline
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-display text-base font-black leading-none truncate">{book.brief?.title ?? book.title}</p>
          <p className="text-[11px] text-muted-foreground font-bold">
            {illustrating
              ? `Illustrating… ${illJob?.done ?? 0}/${total} pages`
              : `${illustrated}/${total} illustrated`}
          </p>
        </div>

        {/* Progress bar when illustrating */}
        {illustrating && illJob && (
          <div className="hidden sm:flex w-32 flex-col gap-0.5">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden chunky-border">
              <div className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(illJob.done / total) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {saving && <span className="flex items-center gap-1 text-xs text-muted-foreground font-bold"><XsSpinner /> Saving</span>}
          <button onClick={() => setNarrateModal(true)}
            className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-extrabold text-accent-foreground chunky-border hover:-translate-y-0.5 transition-transform">
            <Mic className="h-4 w-4" strokeWidth={2.5} /> Narrate
          </button>
          <button onClick={() => setExportModal(true)}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-sm font-extrabold text-background chunky-border hover:-translate-y-0.5 transition-transform">
            <Download className="h-4 w-4" strokeWidth={2.5} /> Export
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="flex w-44 shrink-0 flex-col border-r-[2.5px] border-foreground bg-card overflow-y-auto">
          <div className="p-2 space-y-2">
            {pages.map((p, i) => (
              <PageThumb key={p.id} page={p} bookId={book.id} token={token ?? ""}
                isActive={i === pageIdx}
                illStatus={illJob?.statuses[p.id]}
                onClick={() => switchPage(i)}
              />
            ))}
          </div>
        </aside>

        {/* ── Center: preview ── */}
        <main className="flex flex-1 flex-col items-center justify-center gap-3 overflow-auto p-6 bg-muted/20">
          {/* Page nav */}
          <div className="flex items-center gap-3">
            <button onClick={() => switchPage(Math.max(0, pageIdx - 1))} disabled={pageIdx === 0}
              className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border disabled:opacity-30 hover:-translate-y-0.5 transition-transform">
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <span className="text-xs font-extrabold text-muted-foreground">
              {page?.is_cover ? "Cover" : `Page ${page?.order}`}
            </span>
            <button onClick={() => switchPage(Math.min(pages.length - 1, pageIdx + 1))} disabled={pageIdx === pages.length - 1}
              className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border disabled:opacity-30 hover:-translate-y-0.5 transition-transform">
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          {/* The preview — switches based on mode */}
          {settings.mode === 1 && (
            <Mode1Preview
              blobUrl={blobUrl}
              text={text}
              settings={settings}
              canvasRef={canvasRef as React.RefObject<HTMLDivElement>}
              onSettingsChange={patchSettings}
            />
          )}
          {settings.mode === 2 && (
            <Mode2Preview blobUrl={blobUrl} text={text} settings={settings} />
          )}
          {settings.mode === 3 && (
            <Mode3Preview
              blobUrl={blobUrl}
              text={text}
              overlay={overlay}
              canvasRef={canvasRef as React.RefObject<HTMLDivElement>}
              onMoveStart={e => startInteraction(e, "move")}
              onHandleStart={(e, h) => startInteraction(e, h)}
            />
          )}

          {settings.mode === 3 && (
            <p className="text-[11px] font-semibold text-muted-foreground">
              Drag text box to reposition · Corner/edge handles to resize
            </p>
          )}
          {illustrating && illJob?.statuses[page?.id ?? ""] === "pending" && (
            <p className="text-[11px] font-bold text-primary flex items-center gap-1.5">
              <SmSpinner /> Illustrating this page…
            </p>
          )}
        </main>

        {/* ── Right panel ── */}
        <aside className="flex w-[280px] shrink-0 flex-col border-l-[2.5px] border-foreground bg-card overflow-y-auto">
          <div className="p-4 space-y-5">

            {/* ── Page actions ── */}
            <div className="flex gap-2">
              <button onClick={reIllustrate} disabled={reIllLoading || illustrating}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-background py-2 text-xs font-extrabold chunky-border hover:bg-muted transition-colors disabled:opacity-40">
                {reIllLoading ? <XsSpinner /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} />}
                {page?.has_image ? "Re-illustrate" : "Illustrate"}
              </button>
              <button onClick={audio.toggle} disabled={!page?.has_audio || audio.loading}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-background chunky-border hover:bg-muted transition-colors disabled:opacity-40">
                {audio.loading ? <XsSpinner /> : audio.playing ? <Pause className="h-4 w-4" strokeWidth={2.5} /> : <Play className="h-4 w-4" strokeWidth={2.5} />}
              </button>
              <button onClick={reNarrate} disabled={narratingPage}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-background chunky-border hover:bg-muted transition-colors disabled:opacity-40">
                {narratingPage ? <XsSpinner /> : <Mic className="h-4 w-4" strokeWidth={2.5} />}
              </button>
            </div>

            {/* ── Text content ── */}
            {!page?.is_cover && (
              <div>
                <SL>Page text</SL>
                <textarea
                  value={text}
                  onChange={e => { setText(e.target.value); setDirty(true); }}
                  rows={5}
                  placeholder="Story text for this page…"
                  className="w-full rounded-xl bg-background px-3 py-2.5 text-sm leading-relaxed chunky-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none select-text"
                />
              </div>
            )}

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Text mode selector ── */}
            <div>
              <SL>Text layout</SL>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 1 as TextMode, icon: Layers,      label: "Overlay",  desc: "Over image" },
                  { id: 2 as TextMode, icon: Grid3X3,     label: "Stacked",  desc: "Split view" },
                  { id: 3 as TextMode, icon: Paintbrush,  label: "Canvas",   desc: "Free place" },
                ] as const).map(opt => (
                  <button key={opt.id} onClick={() => patchSettings({ mode: opt.id })}
                    className={cn("flex flex-col items-center gap-0.5 rounded-xl py-2 px-1 chunky-border transition-colors",
                      settings.mode === opt.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                    <opt.icon className="h-4 w-4" strokeWidth={2} />
                    <span className="text-[10px] font-extrabold">{opt.label}</span>
                    <span className={cn("text-[8px]", settings.mode === opt.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Font ── */}
            <div>
              <SL>Font</SL>
              <div className="space-y-1">
                {READER_FONTS.map(f => (
                  <button key={f.id} onClick={() => patchSettings({ fontFamily: f.id as FontId })}
                    className={cn("flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-sm chunky-border transition-colors",
                      settings.fontFamily === f.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                    style={{ fontFamily: f.stack, fontWeight: f.weight }}>
                    <span>{f.label}</span>
                    <span className="text-base opacity-70">{f.sample}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Font size ── */}
            <div>
              <SL>Font size — {settings.fontSize}pt</SL>
              <div className="flex items-center gap-2">
                <button onClick={() => patchSettings({ fontSize: Math.max(8, settings.fontSize - 1) })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background chunky-border hover:bg-muted transition-colors">
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <input type="range" min={8} max={48} step={1} value={settings.fontSize}
                  onChange={e => patchSettings({ fontSize: parseInt(e.target.value) })}
                  className="flex-1 h-2 accent-primary" />
                <button onClick={() => patchSettings({ fontSize: Math.min(48, settings.fontSize + 1) })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background chunky-border hover:bg-muted transition-colors">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* ── Text color ── */}
            <div>
              <SL>Text color</SL>
              <div className="flex flex-wrap gap-2">
                {TEXT_COLORS.map(c => (
                  <button key={c} onClick={() => patchSettings({ textColor: c })}
                    className={cn("h-7 w-7 rounded-lg chunky-border transition-all hover:scale-110",
                      settings.textColor === c ? "ring-2 ring-primary ring-offset-1 scale-110" : "")}
                    style={{ background: c }} />
                ))}
                <label className={cn("relative h-7 w-7 rounded-lg chunky-border cursor-pointer overflow-hidden hover:scale-110 transition-all",
                  !TEXT_COLORS.includes(settings.textColor) ? "ring-2 ring-primary ring-offset-1 scale-110" : "")}
                  style={{ background: settings.textColor }}>
                  <input type="color" value={settings.textColor}
                    onChange={e => patchSettings({ textColor: e.target.value })}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                </label>
              </div>
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Mode-specific controls ── */}

            {settings.mode === 1 && (
              <>
                <div>
                  <SL>Text position</SL>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["top", "center", "bottom"] as TextPosition[]).map(pos => (
                      <button key={pos} onClick={() => patchSettings({ m1Position: pos })}
                        className={cn("rounded-xl py-1.5 text-xs font-extrabold capitalize chunky-border transition-colors",
                          settings.m1Position === pos ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <SL>Text alignment</SL>
                  <div className="flex gap-2">
                    {([
                      { id: "left"   as TextAlign, icon: AlignLeft   },
                      { id: "center" as TextAlign, icon: AlignCenter },
                      { id: "right"  as TextAlign, icon: AlignRight  },
                    ] as const).map(({ id, icon: Icon }) => (
                      <button key={id} onClick={() => patchSettings({ m1Align: id })}
                        className={cn("flex flex-1 items-center justify-center rounded-xl py-2 chunky-border transition-colors",
                          settings.m1Align === id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        <Icon className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <SL>Background</SL>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["none", "frosted", "darkened"] as const).map(style => (
                      <button key={style} onClick={() => patchSettings({ m1BgStyle: style })}
                        className={cn("rounded-xl py-1.5 text-xs font-extrabold capitalize chunky-border transition-colors",
                          settings.m1BgStyle === style ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        {style === "darkened" ? "Dark" : style === "frosted" ? "Frosted" : "None"}
                      </button>
                    ))}
                  </div>
                  {settings.m1BgStyle !== "none" && (
                    <div className="mt-2">
                      <p className="text-[10px] font-bold text-muted-foreground mb-1">Opacity — {Math.round(settings.m1BgOpacity * 100)}%</p>
                      <input type="range" min={0.1} max={1} step={0.05} value={settings.m1BgOpacity}
                        onChange={e => patchSettings({ m1BgOpacity: parseFloat(e.target.value) })}
                        className="w-full h-2 accent-primary" />
                    </div>
                  )}
                </div>
              </>
            )}

            {settings.mode === 2 && (
              <>
                <div>
                  <SL>Text area position</SL>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["bottom", "top"] as const).map(pos => (
                      <button key={pos} onClick={() => patchSettings({ m2Position: pos })}
                        className={cn("rounded-xl py-1.5 text-xs font-extrabold capitalize chunky-border transition-colors",
                          settings.m2Position === pos ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        {pos === "bottom" ? "Image top, text bottom" : "Text top, image bottom"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <SL>Text area color</SL>
                  <div className="flex flex-wrap gap-2">
                    {["#faf8f3", "#ffffff", "#1a1a2e", "#141228", "#fff7ed", "#f0f9ff"].map(c => (
                      <button key={c} onClick={() => patchSettings({ m2BgColor: c })}
                        className={cn("h-7 w-7 rounded-lg chunky-border transition-all hover:scale-110",
                          settings.m2BgColor === c ? "ring-2 ring-primary ring-offset-1 scale-110" : "")}
                        style={{ background: c }} />
                    ))}
                    <label className="relative h-7 w-7 rounded-lg chunky-border cursor-pointer overflow-hidden hover:scale-110 transition-all"
                      style={{ background: settings.m2BgColor }}>
                      <input type="color" value={settings.m2BgColor}
                        onChange={e => patchSettings({ m2BgColor: e.target.value })}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    </label>
                  </div>
                </div>
              </>
            )}

            {settings.mode === 3 && (
              <>
                <div>
                  <SL>Text box background</SL>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["none", "frosted", "darkened"] as const).map(style => (
                      <button key={style} onClick={() => { setOverlay(prev => ({ ...prev, bgStyle: style })); setDirty(true); }}
                        className={cn("rounded-xl py-1.5 text-xs font-extrabold chunky-border transition-colors",
                          overlay.bgStyle === style ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        {style === "darkened" ? "Dark" : style === "frosted" ? "Frosted" : "None"}
                      </button>
                    ))}
                  </div>
                  {overlay.bgStyle !== "none" && (
                    <div className="mt-2">
                      <p className="text-[10px] font-bold text-muted-foreground mb-1">Opacity — {Math.round(overlay.bgOpacity * 100)}%</p>
                      <input type="range" min={0.1} max={1} step={0.05} value={overlay.bgOpacity}
                        onChange={e => { setOverlay(prev => ({ ...prev, bgOpacity: parseFloat(e.target.value) })); setDirty(true); }}
                        className="w-full h-2 accent-primary" />
                    </div>
                  )}
                </div>
                <div>
                  <SL>Snap position</SL>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["top", "center", "bottom"] as const).map(pos => {
                      const yMap = { top: 0.03, center: 0.35, bottom: 0.66 };
                      return (
                        <button key={pos} onClick={() => { setOverlay(prev => ({ ...prev, x: 0.03, y: yMap[pos], w: 0.94 })); setDirty(true); }}
                          className="rounded-xl py-1.5 text-xs font-extrabold capitalize bg-background chunky-border hover:bg-muted transition-colors">
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

          </div>
        </aside>
      </div>

      {/* ── Modals ── */}
      {narrateModal && token && (
        <NarrateModal token={token} book={book} onUpdate={b => setBook(b as unknown as BookOut)} onClose={() => setNarrateModal(false)} />
      )}
      {exportModal && token && (
        <ExportModal book={book} token={token} onClose={() => setExportModal(false)} />
      )}
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense>
      <StudioInner />
    </Suspense>
  );
}
