"use client";

import {
  useState, useEffect, useRef, useCallback, useReducer, Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Download, Mic, Sparkles, RefreshCw, Play, Pause,
  Square as StopIcon, Volume2, Check, Minus, Plus, AlignLeft,
  AlignCenter, AlignRight, ChevronLeft, ChevronRight, ImageIcon,
  Layers, Grid3X3, Paintbrush, Pipette, Trash2, Eye, Save, Undo2, Redo2,
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
  const pages = book.pages.filter(p => !p.is_back_cover);
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
  // Mode 1 – position/align are PAGE-LEVEL (saved on page, not here)
  m1BgStyle: "none" | "frosted" | "darkened";
  m1BgOpacity: number;
  // Mode 2 – stacked
  m2Position: "bottom" | "top";
  m2BgColor: string;
}

const DEFAULT_SETTINGS: BookTextSettings = {
  mode: 2,
  fontSize: 15,
  fontFamily: "nunito",
  textColor: "#000000",
  m1BgStyle: "frosted",
  m1BgOpacity: 0.82,
  m2Position: "bottom",
  m2BgColor: "#faf8f3",
};

function loadSettings(bookId: string): BookTextSettings {
  try {
    const raw = localStorage.getItem(`studio-settings-${bookId}`);
    if (raw) {
      const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      if (parsed.mode === 3) parsed.mode = 2; // canvas mode disabled
      return parsed;
    }
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

// ── Canvas box (Mode 3) ────────────────────────────────────────────────────────

type BoxShape = "rect" | "rounded" | "pill";
type BoxBg    = "none" | "frosted" | "darkened";

interface CanvasBox {
  id: string;
  x: number; y: number; w: number; h: number;
  text: string;
  shape: BoxShape;
  bgStyle: BoxBg;
  bgOpacity: number;
}

function makeBox(text = "", offsetIdx = 0): CanvasBox {
  return {
    id: Math.random().toString(36).slice(2),
    x: 0.03 + offsetIdx * 0.03,
    y: Math.max(0.03, 0.62 - offsetIdx * 0.22),
    w: 0.90,
    h: 0.30,
    text,
    shape: "rounded",
    bgStyle: "frosted",
    bgOpacity: 0.82,
  };
}

function loadBoxes(bookId: string, pageId: string): CanvasBox[] | null {
  try {
    const raw = localStorage.getItem(`canvas3-${bookId}-${pageId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persistBoxes(bookId: string, pageId: string, boxes: CanvasBox[]) {
  try { localStorage.setItem(`canvas3-${bookId}-${pageId}`, JSON.stringify(boxes)); } catch {}
}

function boxBorderRadius(shape: BoxShape): number | string {
  return shape === "rect" ? 3 : shape === "pill" ? 999 : 12;
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
          {page.is_cover ? "Cover" : (page as PageOut & { is_back_cover?: boolean }).is_back_cover ? "Back" : `p.${page.order}`}
          {page.has_audio && <span className="ml-1 opacity-70">♪</span>}
        </div>
      </div>
    </button>
  );
}

// ── Shared preview size (portrait, matching reader's flip page ratio) ──────────

const PREVIEW_STYLE: React.CSSProperties = {
  // 64px nav + 56px studio bar + 40px bottom bar + ~90px (page nav, padding, hint)
  height: "min(800px, calc(100vh - 250px))",
  aspectRatio: "3/4",
  flexShrink: 0,
};

// Reader bg color — used for the gradient blend
const READER_BG = "#faf8f3";

// ── Center: Mode 1 preview (reader-exact gradient blend) ──────────────────────

type DragHandle = "move" | "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

function Mode1Preview({
  blobUrl, text, settings, position, align, onOverflow,
}: {
  blobUrl: string | null;
  text: string;
  settings: BookTextSettings;
  position: TextPosition;
  align: TextAlign;
  onOverflow?: (overflows: boolean) => void;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = textRef.current;
    if (!el || !onOverflow) return;
    onOverflow(el.scrollHeight > el.parentElement!.clientHeight + 4);
  });

  const font     = READER_FONTS.find(f => f.id === settings.fontFamily) ?? READER_FONTS[0];
  const tPos     = position;
  const tAlign   = align as React.CSSProperties["textAlign"];
  const textZone = "38%";
  const gradH    = "47%";

  // Exact gradient from reader/page.tsx
  const gradStyle: React.CSSProperties =
    tPos === "top"
      ? { top: 0, bottom: "auto", background: `linear-gradient(to top, transparent 0%, transparent 22%, rgba(250,248,243,0.30) 42%, rgba(250,248,243,0.78) 62%, rgba(250,248,243,0.96) 78%, ${READER_BG} 90%)` }
    : tPos === "center"
      ? { top: "26%", bottom: "26%", background: `radial-gradient(ellipse at center, rgba(250,248,243,0.90) 30%, transparent 90%)` }
    : { bottom: 0, top: "auto", background: `linear-gradient(to bottom, transparent 0%, transparent 22%, rgba(250,248,243,0.30) 42%, rgba(250,248,243,0.78) 62%, rgba(250,248,243,0.96) 78%, ${READER_BG} 90%)` };

  const posStyle: React.CSSProperties =
    tPos === "top"    ? { top: 0, bottom: "auto" }
    : tPos === "center" ? { top: "31%", bottom: "31%" }
    : { bottom: 0, top: "auto" };

  const justifyClass =
    tPos === "top"    ? "justify-start"
    : tPos === "center" ? "justify-center"
    : "justify-end";

  return (
    <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow"
      style={{ ...PREVIEW_STYLE, background: READER_BG }}>
      {blobUrl ? (
        <img src={blobUrl} alt="" className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "center top" }} draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <ImageIcon className="h-16 w-16 text-muted-foreground/20" strokeWidth={1} />
        </div>
      )}
      {/* Gradient blend — matches reader exactly */}
      <div className="absolute inset-x-0 pointer-events-none" style={{ height: gradH, ...gradStyle }} />
      {/* Text zone */}
      <div className={`absolute inset-x-0 flex flex-col items-center ${justifyClass} overflow-hidden`}
        style={{ height: textZone, padding: "8px 40px 24px 40px", ...posStyle }}>
        <p ref={textRef} style={{
          margin: 0, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word",
          fontFamily: font.stack, fontWeight: font.weight,
          fontSize: `${settings.fontSize}px`, color: settings.textColor,
          textAlign: tAlign, lineHeight: 1.85,
        }}>
          {text
            ? text.replace(/\n{2,}/g, "\n")
            : <span style={{ opacity: 0.3, fontStyle: "italic" }}>No text yet</span>}
        </p>
      </div>
    </div>
  );
}

// ── Center: Mode 2 preview (stacked) ──────────────────────────────────────────

function Mode2Preview({
  blobUrl, text, settings, align, position, onOverflow,
}: {
  blobUrl: string | null;
  text: string;
  settings: BookTextSettings;
  align: TextAlign;
  position: TextPosition;
  onOverflow?: (overflows: boolean) => void;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = textRef.current;
    if (!el || !onOverflow) return;
    onOverflow(el.scrollHeight > el.parentElement!.clientHeight + 4);
  });

  const font = READER_FONTS.find(f => f.id === settings.fontFamily) ?? READER_FONTS[0];
  const isTextBottom = position !== "top";

  const imgBlock = (
    <div className="relative" style={{ flex: "0 0 80%", minHeight: 0 }}>
      {blobUrl ? (
        <img src={blobUrl} alt="" className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "center top" }} draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <ImageIcon className="h-12 w-12 text-muted-foreground/20" strokeWidth={1} />
        </div>
      )}
      {/* Gradient blend: transparent on the image side → solid on the text-area side */}
      <div style={{
        position: "absolute",
        [isTextBottom ? "bottom" : "top"]: 0,
        left: 0, right: 0, height: "45%",
        background: isTextBottom
          ? `linear-gradient(to bottom, transparent, ${settings.m2BgColor})`
          : `linear-gradient(to top, transparent, ${settings.m2BgColor})`,
      }} />
    </div>
  );

  const textBlock = (
    <div style={{
      flex: 1, minHeight: 0, background: settings.m2BgColor,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: isTextBottom ? "16px 56px 44px 56px" : "44px 56px 16px 56px", overflow: "hidden",
    }}>
      <p ref={textRef} style={{
        margin: 0, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word",
        fontFamily: font.stack, fontWeight: font.weight,
        fontSize: settings.fontSize, color: settings.textColor,
        textAlign: align as React.CSSProperties["textAlign"], lineHeight: 1.6,
      }}>
        {text
          ? text.replace(/\n{2,}/g, "\n")
          : <span style={{ opacity: 0.3, fontStyle: "italic" }}>No text yet</span>}
      </p>
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow"
      style={{ ...PREVIEW_STYLE, display: "flex", flexDirection: isTextBottom ? "column" : "column-reverse" }}>
      {imgBlock}
      {textBlock}
    </div>
  );
}

// ── Center: Cover preview — matches reader exactly (gradient + title overlay) ──

function CoverPagePreview({
  blobUrl, text, settings, align, position,
}: {
  blobUrl: string | null;
  text: string;
  settings: BookTextSettings;
  align: TextAlign;
  position: TextPosition;
}) {
  const font = READER_FONTS.find(f => f.id === settings.fontFamily) ?? READER_FONTS[0];
  const fontSize  = settings.fontSize  ?? 32;
  const textColor = settings.textColor ?? "#ffffff";

  const justifyClass =
    position === "top"    ? "justify-start" :
    position === "center" ? "justify-center" :
    "justify-end";

  const paddingStyle: React.CSSProperties =
    position === "top"    ? { paddingTop: 28 } :
    position === "center" ? {} :
    { paddingBottom: 32 };

  return (
    <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow"
      style={{ ...PREVIEW_STYLE, background: "#0a0a14" }}>
      {blobUrl ? (
        <img src={blobUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-2">
          <ImageIcon className="h-16 w-16 text-muted-foreground/20" strokeWidth={1} />
          <span className="text-xs font-bold text-muted-foreground">Cover — not yet illustrated</span>
        </div>
      )}
      {/* Dark gradient — matches reader */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{
        height: "55%",
        background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,20,0.55) 40%, rgba(10,10,20,0.88) 100%)",
      }} />
      {/* Title text */}
      <div className={`absolute inset-0 flex flex-col items-center px-6 overflow-hidden ${justifyClass}`}
        style={paddingStyle}>
        <p style={{
          margin: 0, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word",
          fontFamily: font.stack, fontWeight: font.weight,
          fontSize: `${fontSize}px`, color: textColor,
          textAlign: align as React.CSSProperties["textAlign"],
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          lineHeight: 1.2,
        }}>
          {text || <span style={{ opacity: 0.4, fontStyle: "italic" }}>Book title…</span>}
        </p>
      </div>
    </div>
  );
}

// ── Center: Back-cover preview (full-bleed, no text) ─────────────────────────

function BackCoverPreview({ blobUrl }: { blobUrl: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow"
      style={{ ...PREVIEW_STYLE, background: READER_BG }}>
      {blobUrl ? (
        <img src={blobUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-2">
          <ImageIcon className="h-16 w-16 text-muted-foreground/20" strokeWidth={1} />
          <span className="text-xs font-bold text-muted-foreground">Back cover — not yet illustrated</span>
        </div>
      )}
      <div className="absolute bottom-3 inset-x-3 text-center pointer-events-none">
        <span className="rounded-full bg-black/40 px-3 py-1 text-xs font-extrabold text-white">Back Cover</span>
      </div>
    </div>
  );
}

// ── Center: Mode 3 preview (multi-box canvas) ────────────────────────────────

const DRAG_HANDLES: { id: DragHandle; s: React.CSSProperties; cursor: string }[] = [
  { id: "tl", s: { top: -5, left: -5 },                   cursor: "nw-resize" },
  { id: "t",  s: { top: -5, left: "calc(50% - 5px)" },    cursor: "n-resize"  },
  { id: "tr", s: { top: -5, right: -5 },                  cursor: "ne-resize" },
  { id: "r",  s: { top: "calc(50% - 5px)", right: -5 },   cursor: "e-resize"  },
  { id: "br", s: { bottom: -5, right: -5 },               cursor: "se-resize" },
  { id: "b",  s: { bottom: -5, left: "calc(50% - 5px)" }, cursor: "s-resize"  },
  { id: "bl", s: { bottom: -5, left: -5 },                cursor: "sw-resize" },
  { id: "l",  s: { top: "calc(50% - 5px)", left: -5 },    cursor: "w-resize"  },
];

function Mode3Preview({
  blobUrl, boxes, activeBoxIdx, settings, canvasRef,
  onBoxClick, onMoveStart, onHandleStart, onAdd, onDuplicate, onRemove,
}: {
  blobUrl: string | null;
  boxes: CanvasBox[];
  activeBoxIdx: number;
  settings: BookTextSettings;
  canvasRef: React.RefObject<HTMLDivElement>;
  onBoxClick: (idx: number) => void;
  onMoveStart: (e: React.MouseEvent, idx: number) => void;
  onHandleStart: (e: React.MouseEvent, h: DragHandle, idx: number) => void;
  onAdd: () => void;
  onDuplicate: (idx: number) => void;
  onRemove: (idx: number) => void;
}) {
  const font = READER_FONTS.find(f => f.id === settings.fontFamily) ?? READER_FONTS[0];

  return (
    <div ref={canvasRef} className="relative rounded-2xl chunky-border chunky-shadow"
      style={{ ...PREVIEW_STYLE }}>
      {/* Image layer */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        {blobUrl ? (
          <img src={blobUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full bg-muted flex items-center justify-center">
            <ImageIcon className="h-16 w-16 text-muted-foreground/20" strokeWidth={1} />
          </div>
        )}
      </div>

      {/* Boxes */}
      {boxes.map((box, idx) => {
        const isActive = idx === activeBoxIdx;
        const br = boxBorderRadius(box.shape);
        const bg: React.CSSProperties =
          box.bgStyle === "none"     ? {} :
          box.bgStyle === "frosted"  ? { backdropFilter: "blur(14px)", backgroundColor: `rgba(255,255,255,${box.bgOpacity * 0.82})` } :
          { backgroundColor: `rgba(0,0,0,${box.bgOpacity})` };

        return (
          <div key={box.id}
            style={{
              position: "absolute",
              left: `${box.x * 100}%`, top: `${box.y * 100}%`,
              width: `${box.w * 100}%`, height: `${box.h * 100}%`,
              cursor: isActive ? "move" : "pointer", userSelect: "none", zIndex: isActive ? 10 : 5,
            }}
            onMouseDown={e => isActive ? onMoveStart(e, idx) : (e.preventDefault(), onBoxClick(idx))}
          >
            {/* Background fill */}
            <div style={{ position: "absolute", inset: 0, borderRadius: br, ...bg }} />
            {/* Text */}
            <div style={{
              position: "relative", zIndex: 1, height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "8px 14px", overflow: "hidden",
              fontFamily: font.stack, fontWeight: font.weight,
              fontSize: settings.fontSize, color: settings.textColor,
              textAlign: "center", lineHeight: 1.3,
            }}>
              <p style={{ margin: 0, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {box.text || <span style={{ opacity: 0.3, fontStyle: "italic" }}>Box {idx + 1}</span>}
              </p>
            </div>
            {/* Border ring */}
            <div style={{
              position: "absolute", inset: 0,
              border: isActive ? "2px dashed oklch(0.7 0.18 35)" : "1.5px solid rgba(100,100,220,0.45)",
              borderRadius: br, pointerEvents: "none",
            }} />
            {/* Number badge on inactive boxes */}
            {!isActive && (
              <div style={{
                position: "absolute", top: -8, left: -8,
                background: "oklch(0.55 0.16 260)", color: "#fff",
                borderRadius: "50%", width: 16, height: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 800, pointerEvents: "none",
              }}>{idx + 1}</div>
            )}
            {/* Floating toolbar above active box */}
            {isActive && (
              <div
                style={{
                  position: "absolute", top: -34, left: "50%", transform: "translateX(-50%)",
                  display: "flex", gap: 4, zIndex: 30,
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                {/* Box label */}
                <div style={{
                  background: "oklch(0.55 0.16 260)", color: "#fff",
                  borderRadius: 6, padding: "2px 7px",
                  fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center",
                }}>Box {idx + 1}</div>
                {/* Duplicate */}
                <button
                  title="Duplicate box"
                  onClick={e => { e.stopPropagation(); onDuplicate(idx); }}
                  style={{
                    background: "oklch(0.99 0.01 85)", border: "2px solid oklch(0.7 0.18 35)",
                    borderRadius: 6, width: 26, height: 26, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                {/* Add */}
                <button
                  title="Add box"
                  onClick={e => { e.stopPropagation(); onAdd(); }}
                  style={{
                    background: "oklch(0.99 0.01 85)", border: "2px solid oklch(0.7 0.18 35)",
                    borderRadius: 6, width: 26, height: 26, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                {/* Delete — only if more than 1 box */}
                {boxes.length > 1 && (
                  <button
                    title="Delete box"
                    onClick={e => { e.stopPropagation(); onRemove(idx); }}
                    style={{
                      background: "oklch(0.99 0.01 85)", border: "2px solid oklch(0.65 0.2 25)",
                      borderRadius: 6, width: 26, height: 26, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.55 0.22 25)",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
            {/* Resize handles — only for active box */}
            {isActive && DRAG_HANDLES.map(({ id, s, cursor }) => (
              <div key={id}
                style={{
                  position: "absolute", width: 11, height: 11,
                  background: "oklch(0.99 0.01 85)",
                  border: "2.5px solid oklch(0.7 0.18 35)",
                  borderRadius: 3, cursor, zIndex: 20, ...s,
                }}
                onMouseDown={e => { e.stopPropagation(); onHandleStart(e, id, idx); }}
              />
            ))}
          </div>
        );
      })}
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
  x: 0.03, y: 0.62, w: 0.94, h: 0.34,
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
  const [text,          setText]         = useState("");
  const [settings,     setSettings]     = useState<BookTextSettings>(DEFAULT_SETTINGS);
  const bookSettingsRef = useRef<BookTextSettings>(DEFAULT_SETTINGS);
  const [boxes,        setBoxes]        = useState<CanvasBox[]>([]);
  const [activeBoxIdx, setActiveBoxIdx] = useState(0);
  const [pagePosition, setPagePosition] = useState<TextPosition>("bottom");
  const [pageAlign,    setPageAlign]    = useState<TextAlign>("center");
  const [saving,        setSaving]       = useState(false);
  const [dirty,         setDirty]        = useState(false);
  // Undo/redo history (text snapshots only; settings/position changes are lightweight)
  const [undoStack,     setUndoStack]    = useState<string[]>([]);
  const [redoStack,     setRedoStack]    = useState<string[]>([]);
  const [textOverflows, setTextOverflows] = useState(false);
  const [splitting,     setSplitting]    = useState(false);
  const [backCoverLoading, setBackCoverLoading] = useState(false);

  const [illustrating, setIllustrating]  = useState(false);
  const [reIllLoading, setReIllLoading]  = useState(false);
  const [narrateModal, setNarrateModal]  = useState(false);
  const [exportModal,  setExportModal]   = useState(false);

  const canvasRef  = useRef<HTMLDivElement>(null);
  const dragRef    = useRef<{ handle: DragHandle; sx: number; sy: number; snap: {x:number;y:number;w:number;h:number}; boxIdx: number } | null>(null);
  const latestRef  = useRef({ text, boxes, settings, pagePosition, pageAlign });
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef<string>("");

  const pages = book?.pages ?? [];
  const page  = pages[pageIdx] ?? null;
  const illJob = useIllJob(book?.id ?? "");

  // Load settings from localStorage when book loads
  useEffect(() => {
    if (!book) return;
    const loaded = loadSettings(book.id);
    bookSettingsRef.current = loaded;
    setSettings(loaded);
  }, [book?.id]);

  // Sync page data when switching
  useEffect(() => {
    if (!page || !book) return;
    setText((page.text ?? "").replace(/\n{2,}/g, "\n"));
    setPagePosition((page.text_position as TextPosition) ?? (page.is_cover ? "bottom" : "bottom"));
    setPageAlign((page.text_align as TextAlign) ?? "center");
    // Cover page: show its own style (Kranky/32/white by default, or saved per-page values).
    // Content pages: always restore the true book-level settings from the ref, so that visiting
    // the cover and coming back never corrupts the content-page font/size/color.
    if (page.is_cover && !page.font_family && !page.font_size && !page.text_color) {
      setSettings(prev => ({ ...prev, fontFamily: "kranky" as FontId, fontSize: 32, textColor: "#ffffff" }));
    } else if (page.is_cover && (page.font_size || page.font_family || page.text_color)) {
      setSettings(prev => ({
        ...prev,
        ...(page.font_size   ? { fontSize:   page.font_size }             : {}),
        ...(page.font_family ? { fontFamily: page.font_family as FontId } : {}),
        ...(page.text_color  ? { textColor:  page.text_color }            : {}),
      }));
    } else if (!page.is_cover) {
      setSettings(bookSettingsRef.current);
    }
    // Load canvas boxes from localStorage, or init from page text
    const saved = loadBoxes(book.id, page.id);
    setBoxes(saved ?? [makeBox(page.text ?? "")]);
    setActiveBoxIdx(0);
    setTextOverflows(false);
    setDirty(false);
    setUndoStack([]);
    setRedoStack([]);
    lastSnapshotRef.current = page.text ?? "";
  }, [pageIdx, page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep latestRef in sync
  useEffect(() => { latestRef.current = { text, boxes, settings, pagePosition, pageAlign }; });

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

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo, Ctrl+S save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement;
      // Don't intercept when user is typing in textarea
      if (active?.tagName === "TEXTAREA" || active?.tagName === "INPUT") {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          save();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
        if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
        if (e.key === "s") { e.preventDefault(); save(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (!token || !book || !page) return;
    const { text: tx, boxes: bxs, settings: st, pagePosition: pos, pageAlign: align } = latestRef.current;

    // Persist canvas boxes locally
    if (st.mode === 3) persistBoxes(book.id, page.id, bxs);

    // Build canvas_overlay for backend (used by exports)
    let overlayToSave: CanvasOverlay | null = null;
    if (st.mode === 1) {
      overlayToSave = {
        ...DEFAULT_OVERLAY,
        fontSize: st.fontSize,
        fontFamily: st.fontFamily,
        textColor: st.textColor,
        bgStyle: st.m1BgStyle,
        bgOpacity: st.m1BgOpacity,
      };
    } else if (st.mode === 2) {
      overlayToSave = {
        ...DEFAULT_OVERLAY,
        fontSize: st.fontSize,
        fontFamily: st.fontFamily,
        textColor: st.textColor,
        bgStyle: ("stacked-" + st.m2Position) as CanvasOverlay["bgStyle"],
        bgOpacity: 1,
      };
    } else {
      // Save first box position for basic export compat
      const b = bxs[0];
      overlayToSave = b ? {
        x: b.x, y: b.y, w: b.w, h: b.h,
        fontSize: st.fontSize, fontFamily: st.fontFamily, textColor: st.textColor,
        bgStyle: b.bgStyle as CanvasOverlay["bgStyle"], bgOpacity: b.bgOpacity,
      } : DEFAULT_OVERLAY;
    }

    setSaving(true);
    try {
      // Save current page: text content + per-page position/align + cover style
      const pagePayload: Record<string, unknown> = {
        text: tx,
        text_align: align,
        text_position: pos,
        canvas_overlay: overlayToSave,
      };
      // Cover page saves its own font/size/color; content pages use book-level bulk save below
      if (page.is_cover) {
        pagePayload.font_size   = st.fontSize;
        pagePayload.font_family = st.fontFamily;
        pagePayload.text_color  = st.textColor;
      }

      // Apply book-level style (mode, font, size, color, overlay) to ALL content pages
      const [pageResult, bulkResult] = await Promise.all([
        api.books.updatePage(token, book.id, page.id, pagePayload as Parameters<typeof api.books.updatePage>[3]),
        !page.is_cover && !page.is_back_cover
          ? api.books.bulkPageStyle(token, book.id, {
              font_family:    st.fontFamily,
              font_size:      st.fontSize,
              text_color:     st.textColor,
              text_mode:      st.mode,
              canvas_overlay: overlayToSave,
            })
          : Promise.resolve(null),
      ]);
      // Use bulkPageStyle result when available — it reflects the updated text_mode
      // across all pages; fall back to updatePage result for cover edits
      setBook((bulkResult ?? pageResult) as unknown as BookOut);
      setDirty(false);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  }, [token, book?.id, page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function markDirty() {
    setDirty(true);
  }

  // Push a text snapshot to undo stack (debounced — groups rapid keystrokes)
  function pushUndoSnapshot(prev: string) {
    if (undoDebounceRef.current) clearTimeout(undoDebounceRef.current);
    undoDebounceRef.current = setTimeout(() => {
      if (prev === lastSnapshotRef.current) return;
      lastSnapshotRef.current = prev;
      setUndoStack(s => [...s.slice(-49), prev]);
      setRedoStack([]);
    }, 500);
  }

  function undo() {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setRedoStack(r => [latestRef.current.text, ...r.slice(0, 49)]);
      setText(snapshot);
      lastSnapshotRef.current = snapshot;
      markDirty();
      return prev.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[0];
      setUndoStack(u => [...u.slice(-49), latestRef.current.text]);
      setText(snapshot);
      lastSnapshotRef.current = snapshot;
      markDirty();
      return prev.slice(1);
    });
  }

  function patchSettings(patch: Partial<BookTextSettings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      if (book && !page?.is_cover) {
        bookSettingsRef.current = next;
        saveSettings(book.id, next);
      }
      return next;
    });
    markDirty();
  }

  function switchPage(idx: number) {
    setPageIdx(idx);
  }

  // ── Canvas drag/resize (Mode 3) ────────────────────────────────────────────

  function startInteraction(e: React.MouseEvent, handle: DragHandle, boxIdx: number) {
    e.preventDefault();
    setActiveBoxIdx(boxIdx);
    const box = latestRef.current.boxes[boxIdx];
    if (!box) return;
    dragRef.current = { handle, sx: e.clientX, sy: e.clientY, snap: { x: box.x, y: box.y, w: box.w, h: box.h }, boxIdx };

    function onMove(ev: MouseEvent) {
      const dr = dragRef.current;
      if (!dr || !canvasRef.current) return;
      const cw = canvasRef.current.clientWidth;
      const ch = canvasRef.current.clientHeight;
      const dx = (ev.clientX - dr.sx) / cw;
      const dy = (ev.clientY - dr.sy) / ch;
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
      setBoxes(prev => { const next = [...prev]; if (next[dr.boxIdx]) next[dr.boxIdx] = { ...next[dr.boxIdx], x, y, w, h }; return next; });
    }

    function onUp() {
      dragRef.current = null;
      markDirty();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function patchActiveBox(patch: Partial<CanvasBox>) {
    setBoxes(prev => { const next = [...prev]; if (next[activeBoxIdx]) next[activeBoxIdx] = { ...next[activeBoxIdx], ...patch }; return next; });
    markDirty();
  }

  function addBox() {
    if (boxes.length >= 3) {
      toast.error("Cannot exceed 3 text boxes per page");
      return;
    }
    const idx = boxes.length;
    setBoxes(prev => [...prev, makeBox("", idx)]);
    setActiveBoxIdx(idx);
    markDirty();
  }

  function duplicateBox(idx: number) {
    if (boxes.length >= 3) {
      toast.error("Cannot exceed 3 text boxes per page");
      return;
    }
    const src = boxes[idx];
    if (!src) return;
    const copy: CanvasBox = {
      ...src,
      id: Math.random().toString(36).slice(2),
      x: Math.min(src.x + 0.04, 1 - src.w),
      y: Math.min(src.y + 0.04, 1 - src.h),
    };
    setBoxes(prev => [...prev, copy]);
    setActiveBoxIdx(boxes.length);
    markDirty();
  }

  function removeBox(idx: number) {
    if (boxes.length <= 1) return;
    setBoxes(prev => prev.filter((_, i) => i !== idx));
    setActiveBoxIdx(Math.max(0, idx - 1));
    markDirty();
  }

  // ── Split page ────────────────────────────────────────────────────────────

  async function splitPage() {
    if (!token || !book || !page) return;
    setSplitting(true);
    try {
      const updated = await api.books.splitPage(token, book.id, page.id);
      setBook(updated as unknown as BookOut);
      setTextOverflows(false);
      // Navigate to the newly inserted page so the user can see it and so
      // the sync useEffect re-runs (same page.id means it won't fire otherwise)
      const newIdx = pageIdx + 1;
      setPageIdx(newIdx);
      // Auto-illustrate the new page; fire-and-forget so split completes immediately
      const newPageId = (updated as any).pages?.[newIdx]?.id as string | undefined;
      if (newPageId) {
        toast.success(`Page ${page.order} split — illustrating new page ${page.order + 1}…`);
        setReIllLoading(true);
        (async () => {
          // Gemini image generation occasionally fails transiently even with
          // backend retries; one extra client-side attempt avoids forcing the
          // user to manually click Illustrate.
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const withImage = await api.books.illustratePage(token, book.id, newPageId);
              setBook(withImage as unknown as BookOut);
              toast.success(`Page ${page.order + 1} illustrated!`);
              return;
            } catch {
              if (attempt === 1) toast.error("Auto-illustration failed — click Illustrate to retry");
            }
          }
        })().finally(() => setReIllLoading(false));
      } else {
        toast.success(`Page ${page.order} split — new page ${page.order + 1} added`);
      }
    } catch { toast.error("Split failed"); }
    finally { setSplitting(false); }
  }

  // ── Back cover ────────────────────────────────────────────────────────────

  async function handleBackCoverIllustrate() {
    if (!token || !book) return;
    setBackCoverLoading(true);
    try {
      const withCover = await api.books.createBackCover(token, book.id).catch(() => book);
      setBook(withCover as unknown as BookOut);
      const updated = await api.books.illustrateBackCover(token, book.id);
      setBook(updated as unknown as BookOut);
      toast.success("Back cover illustrated!");
    } catch { toast.error("Back cover illustration failed"); }
    finally { setBackCoverLoading(false); }
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
  const [thumbsOpen, setThumbsOpen] = useState(false);

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
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background overflow-hidden select-none">

      {/* ── Top bar ── */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b-[2.5px] border-foreground bg-card px-4">
        <button onClick={() => router.push("/editor")}
          className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Editor
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
          {/* Undo / Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              className="grid h-8 w-8 place-items-center rounded-lg bg-background chunky-border hover:bg-muted transition-colors disabled:opacity-30"
            >
              <Undo2 className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Shift+Z)"
              className="grid h-8 w-8 place-items-center rounded-lg bg-background chunky-border hover:bg-muted transition-colors disabled:opacity-30"
            >
              <Redo2 className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-40"
          >
            {saving ? <XsSpinner /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
          <button
            onClick={() => router.push(`/reader?from=studio`)}
            className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-extrabold text-accent-foreground chunky-border hover:-translate-y-0.5 transition-transform"
          >
            <Eye className="h-4 w-4" strokeWidth={2.5} /> Preview
          </button>
          <button onClick={() => setNarrateModal(true)}
            className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">
            <Mic className="h-4 w-4" strokeWidth={2.5} /> Narrate
          </button>
          <button onClick={async () => { await save(); setExportModal(true); }}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-sm font-extrabold text-background chunky-border hover:-translate-y-0.5 transition-transform">
            <Download className="h-4 w-4" strokeWidth={2.5} /> Export
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden flex-col">
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: page actions + text + layout ── */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r-[2.5px] border-foreground bg-card overflow-y-auto">
          <div className="p-4 space-y-4">

            {/* Page actions */}
            {page?.is_back_cover ? (
              <div className="flex gap-2">
                <button onClick={handleBackCoverIllustrate} disabled={backCoverLoading}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-background py-2 text-xs font-extrabold chunky-border hover:bg-muted transition-colors disabled:opacity-40">
                  {backCoverLoading ? <XsSpinner /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  {page?.has_image ? "Re-illustrate back cover" : "Illustrate back cover"}
                </button>
              </div>
            ) : (
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
            )}

            {/* Page text — shown for all pages except back cover */}
            {!page?.is_back_cover && settings.mode !== 3 && (
              <div>
                <SL>{page?.is_cover ? "Cover title" : "Page text"}</SL>
                <textarea
                  value={text}
                  onChange={e => { pushUndoSnapshot(text); setText(e.target.value); markDirty(); }}
                  rows={page?.is_cover ? 3 : 6}
                  placeholder={page?.is_cover ? "Book title…" : "Story text for this page…"}
                  className="w-full rounded-xl bg-background px-3 py-2.5 text-sm leading-relaxed chunky-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none select-text"
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
                />
              </div>
            )}


            {/* Back cover info */}
            {page?.is_back_cover && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The back cover is a full-bleed illustration — no text overlay.
              </p>
            )}

            {!page?.is_back_cover && !page?.is_cover && <div className="border-t-[1.5px] border-foreground/15" />}

            {/* Text layout mode selector — hidden for cover and back cover */}
            {!page?.is_cover && !page?.is_back_cover && (
            <div>
              <SL>Text layout</SL>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 1 as TextMode, icon: Layers,      label: "Overlay", desc: "Over image", disabled: false },
                  { id: 2 as TextMode, icon: Grid3X3,     label: "Stacked", desc: "Split view", disabled: false },
                  { id: 3 as TextMode, icon: Paintbrush,  label: "Canvas",  desc: "Coming soon", disabled: true },
                ] as const).map(opt => (
                  <button key={opt.id}
                    onClick={() => !opt.disabled && patchSettings({ mode: opt.id })}
                    disabled={opt.disabled}
                    className={cn("flex flex-col items-center gap-0.5 rounded-xl py-2 px-1 chunky-border transition-colors",
                      opt.disabled
                        ? "bg-background opacity-40 cursor-not-allowed"
                        : settings.mode === opt.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted")}>
                    <opt.icon className="h-4 w-4" strokeWidth={2} />
                    <span className="text-[10px] font-extrabold">{opt.label}</span>
                    <span className={cn("text-[8px]", settings.mode === opt.id && !opt.disabled ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Mode 1 — overlay controls */}
            {!page?.is_cover && !page?.is_back_cover && settings.mode === 1 && (
              <>
                <p className="text-[11px] text-muted-foreground">Matches the reader. Position and alignment are saved per page.</p>
                <div>
                  <SL>Text position</SL>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["top", "center", "bottom"] as TextPosition[]).map(pos => (
                      <button key={pos} onClick={() => { setPagePosition(pos); markDirty(); }}
                        className={cn("rounded-xl py-1.5 text-xs font-extrabold capitalize chunky-border transition-colors",
                          pagePosition === pos ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
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
                      <button key={id} onClick={() => { setPageAlign(id); markDirty(); }}
                        className={cn("flex flex-1 items-center justify-center rounded-xl py-2 chunky-border transition-colors",
                          pageAlign === id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        <Icon className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Mode 2 — stacked controls */}
            {!page?.is_cover && !page?.is_back_cover && settings.mode === 2 && (
              <>
                <div>
                  <SL>Text area position</SL>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["bottom", "top"] as const).map(pos => (
                      <button key={pos} onClick={() => { setPagePosition(pos); markDirty(); }}
                        className={cn("rounded-xl py-1.5 text-xs font-extrabold chunky-border transition-colors",
                          pagePosition === pos ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        {pos === "bottom" ? "Image top, text bottom" : "Text top, image bottom"}
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
                      <button key={id} onClick={() => { setPageAlign(id); markDirty(); }}
                        className={cn("flex flex-1 items-center justify-center rounded-xl py-2 chunky-border transition-colors",
                          pageAlign === id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        <Icon className="h-4 w-4" strokeWidth={2.5} />
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
                    <label className={cn("relative h-7 w-7 rounded-lg chunky-border cursor-pointer hover:scale-110 transition-all flex items-center justify-center",
                      !["#faf8f3","#ffffff","#1a1a2e","#141228","#fff7ed","#f0f9ff"].includes(settings.m2BgColor) ? "ring-2 ring-primary ring-offset-1 scale-110" : "")}
                      style={{ background: ["#faf8f3","#ffffff","#1a1a2e","#141228","#fff7ed","#f0f9ff"].includes(settings.m2BgColor) ? "#e5e7eb" : settings.m2BgColor }}
                      title="Custom color">
                      <Pipette className="h-3.5 w-3.5 pointer-events-none text-gray-600" strokeWidth={2} />
                      <input type="color" value={settings.m2BgColor}
                        onChange={e => patchSettings({ m2BgColor: e.target.value })}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    </label>
                  </div>
                </div>
              </>
            )}


          </div>
        </aside>

        {/* ── Center: preview ── */}
        <main className="flex flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-4 py-3 bg-muted/20">
          {/* Page nav */}
          <div className="flex items-center gap-3">
            <button onClick={() => switchPage(Math.max(0, pageIdx - 1))} disabled={pageIdx === 0}
              className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border disabled:opacity-30 hover:-translate-y-0.5 transition-transform">
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <span className="text-xs font-extrabold text-muted-foreground">
              {page?.is_cover ? "Cover" : page?.is_back_cover ? "Back Cover" : `Page ${page?.order}`}
            </span>
            <button onClick={() => switchPage(Math.min(pages.length - 1, pageIdx + 1))} disabled={pageIdx === pages.length - 1}
              className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border disabled:opacity-30 hover:-translate-y-0.5 transition-transform">
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          {/* The preview */}
          {page?.is_back_cover ? (
            <BackCoverPreview blobUrl={blobUrl} />
          ) : page?.is_cover ? (
            <CoverPagePreview blobUrl={blobUrl} text={text} settings={settings}
              align={pageAlign} position={pagePosition} />
          ) : settings.mode === 1 ? (
            <Mode1Preview blobUrl={blobUrl} text={text} settings={settings}
              position={pagePosition} align={pageAlign}
              onOverflow={setTextOverflows} />
          ) : (
            <Mode2Preview blobUrl={blobUrl} text={text} settings={settings}
              align={pageAlign} position={pagePosition} onOverflow={setTextOverflows} />
          )}

          {/* Overflow warning — shown in modes 1 & 2 when text exceeds the text zone */}
          {textOverflows && !page?.is_cover && settings.mode !== 3 && (
            <div className="flex items-center gap-2 rounded-xl border-[2px] border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              <span>⚠ Text overflows the page</span>
              <button
                onClick={splitPage}
                disabled={splitting}
                className="ml-auto flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-extrabold text-amber-900 hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {splitting ? <XsSpinner /> : null}
                {splitting ? "Splitting…" : "Split page →"}
              </button>
            </div>
          )}

          {illustrating && illJob?.statuses[page?.id ?? ""] === "pending" && (
            <p className="text-[11px] font-bold text-primary flex items-center gap-1.5">
              <SmSpinner /> Illustrating this page…
            </p>
          )}
        </main>

        {/* ── Right panel: font + size + color ── */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l-[2.5px] border-foreground bg-card overflow-y-auto">
          <div className="p-4 space-y-5">

            {/* Cover-only: position + alignment */}
            {page?.is_cover && (
              <>
                <div>
                  <SL>Text position</SL>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["top", "center", "bottom"] as TextPosition[]).map(pos => (
                      <button key={pos} onClick={() => { setPagePosition(pos); markDirty(); }}
                        className={cn("rounded-xl py-1.5 text-xs font-extrabold capitalize chunky-border transition-colors",
                          pagePosition === pos ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
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
                      <button key={id} onClick={() => { setPageAlign(id); markDirty(); }}
                        className={cn("flex flex-1 items-center justify-center rounded-xl py-2 chunky-border transition-colors",
                          pageAlign === id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                        <Icon className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t-[1.5px] border-foreground/15" />
              </>
            )}

            {/* Font family */}
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

            {/* Font size */}
            <div>
              <SL>Font size</SL>
              <div className="flex items-center gap-2">
                <button onClick={() => patchSettings({ fontSize: Math.max(8, settings.fontSize - 1) })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background chunky-border hover:bg-muted transition-colors">
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <input
                  type="number" min={8} max={96} step={1}
                  defaultValue={settings.fontSize}
                  key={settings.fontSize}
                  onBlur={e => {
                    const v = parseInt(e.target.value);
                    patchSettings({ fontSize: isNaN(v) ? settings.fontSize : Math.min(96, Math.max(8, v)) });
                  }}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-16 rounded-lg bg-background px-2 py-1.5 text-center text-sm font-extrabold chunky-border focus:outline-none focus:ring-2 focus:ring-primary/40 select-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-xs font-bold text-muted-foreground shrink-0">pt</span>
                <button onClick={() => patchSettings({ fontSize: Math.min(96, settings.fontSize + 1) })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background chunky-border hover:bg-muted transition-colors">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* Text color */}
            <div>
              <SL>Text color</SL>
              <div className="flex flex-wrap gap-2">
                {TEXT_COLORS.map(c => (
                  <button key={c} onClick={() => patchSettings({ textColor: c })}
                    className={cn("h-7 w-7 rounded-lg chunky-border transition-all hover:scale-110",
                      settings.textColor === c ? "ring-2 ring-primary ring-offset-1 scale-110" : "")}
                    style={{ background: c }} />
                ))}
                <label className={cn("relative h-7 w-7 rounded-lg chunky-border cursor-pointer hover:scale-110 transition-all flex items-center justify-center",
                  !TEXT_COLORS.includes(settings.textColor) ? "ring-2 ring-primary ring-offset-1 scale-110" : "")}
                  style={{ background: TEXT_COLORS.includes(settings.textColor) ? "#e5e7eb" : settings.textColor }}
                  title="Custom color">
                  <Pipette className="h-3.5 w-3.5 pointer-events-none"
                    style={{ color: TEXT_COLORS.includes(settings.textColor) ? "#374151" : settings.textColor === "#ffffff" || settings.textColor === "#fff7ed" ? "#374151" : "#fff" }}
                    strokeWidth={2} />
                  <input type="color" value={settings.textColor}
                    onChange={e => patchSettings({ textColor: e.target.value })}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                </label>
              </div>
            </div>

          </div>
        </aside>
      </div>

      {/* ── Bottom: collapsible page thumbnails ── */}
      <div className="shrink-0 border-t-[2.5px] border-foreground bg-card">
        {/* Toggle bar */}
        <button
          onClick={() => setThumbsOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Pages</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {pages.length}
            </span>
            {illustrated > 0 && (
              <span className="text-[10px] font-semibold text-muted-foreground">{illustrated}/{total} illustrated</span>
            )}
          </div>
          <ChevronLeft
            className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", thumbsOpen ? "-rotate-90" : "rotate-90")}
            strokeWidth={2.5}
          />
        </button>
        {/* Thumbnail strip */}
        {thumbsOpen && (
          <div className="overflow-x-auto">
            <div className="flex gap-2 px-4 pb-3 pt-1">
              {pages.map((p, i) => (
                <div key={p.id} className="shrink-0 w-24">
                  <PageThumb page={p} bookId={book.id} token={token ?? ""}
                    isActive={i === pageIdx}
                    illStatus={illJob?.statuses[p.id]}
                    onClick={() => switchPage(i)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
