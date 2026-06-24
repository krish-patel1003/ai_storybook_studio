"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight,
  ImageIcon, Minus, Plus, RotateCcw,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import {
  api, pageImageUrl, type PageOut, type BookOut, type CanvasOverlay,
} from "@/lib/api";
import { useAuthImage } from "@/lib/use-auth-image";
import { READER_FONTS } from "@/lib/fonts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { XsSpinner } from "@/components/character-spinner";

// ── Constants ──────────────────────────────────────────────────────────────────

const MIN_W = 0.08;
const MIN_H = 0.05;

const DEFAULT_OVERLAY: CanvasOverlay = {
  x: 0.03,
  y: 0.66,
  w: 0.94,
  h: 0.30,
  fontSize: 20,
  fontFamily: "unkempt",
  textColor: "#1a1a2e",
  bgStyle: "frosted",
  bgOpacity: 0.82,
};

const TEXT_COLORS = [
  { hex: "#1a1a2e", label: "Dark" },
  { hex: "#ffffff", label: "White" },
  { hex: "#fff7ed", label: "Cream" },
  { hex: "#1e3a5f", label: "Navy" },
  { hex: "#7c3aed", label: "Purple" },
  { hex: "#dc2626", label: "Red" },
  { hex: "#0f766e", label: "Teal" },
  { hex: "#92400e", label: "Brown" },
];

type DragHandle = "move" | "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ── Page thumbnail ─────────────────────────────────────────────────────────────

function PageThumb({
  page, bookId, token, isActive, onClick,
}: {
  page: PageOut; bookId: string; token: string; isActive: boolean; onClick: () => void;
}) {
  const blobUrl = useAuthImage(pageImageUrl(bookId, page.id), token, page.has_image);

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full overflow-hidden rounded-xl border-[2.5px] transition-all hover:scale-[1.02] active:scale-100",
        isActive ? "border-primary shadow-md scale-[1.02]" : "border-foreground/20 hover:border-foreground/40"
      )}
    >
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {blobUrl ? (
          <img src={blobUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground/30" strokeWidth={1.5} />
          </div>
        )}

        {/* Text overlay preview */}
        {page.canvas_overlay && (
          <div style={{
            position: "absolute",
            left: `${page.canvas_overlay.x * 100}%`,
            top: `${page.canvas_overlay.y * 100}%`,
            width: `${page.canvas_overlay.w * 100}%`,
            height: `${page.canvas_overlay.h * 100}%`,
            background: page.canvas_overlay.bgStyle === "none" ? "transparent"
              : page.canvas_overlay.bgStyle === "frosted" ? `rgba(255,255,255,${page.canvas_overlay.bgOpacity * 0.7})`
              : `rgba(0,0,0,${page.canvas_overlay.bgOpacity})`,
            borderRadius: 2,
          }} />
        )}

        <div className={cn(
          "absolute bottom-0 inset-x-0 py-0.5 text-center text-[9px] font-extrabold",
          isActive ? "bg-primary text-primary-foreground" : "bg-black/50 text-white"
        )}>
          {page.is_cover ? "Cover" : `p.${page.order}`}
        </div>
      </div>
    </button>
  );
}

// ── Draggable text overlay ─────────────────────────────────────────────────────

function TextOverlay({
  overlay, text, active,
  onMoveStart, onHandleStart,
}: {
  overlay: CanvasOverlay;
  text: string;
  active: boolean;
  onMoveStart: (e: React.MouseEvent) => void;
  onHandleStart: (e: React.MouseEvent, h: DragHandle) => void;
}) {
  const font = READER_FONTS.find(f => f.id === overlay.fontFamily) ?? READER_FONTS[0];

  const bg: React.CSSProperties =
    overlay.bgStyle === "none"     ? {} :
    overlay.bgStyle === "frosted"  ? { backdropFilter: "blur(14px) saturate(1.4)", backgroundColor: `rgba(255,255,255,${overlay.bgOpacity * 0.82})` } :
    /* darkened */                   { backgroundColor: `rgba(0,0,0,${overlay.bgOpacity})` };

  const HANDLES: { id: DragHandle; style: React.CSSProperties; cursor: string }[] = [
    { id: "tl", style: { top: -5, left: -5 },                   cursor: "nw-resize" },
    { id: "t",  style: { top: -5, left: "calc(50% - 5px)" },    cursor: "n-resize"  },
    { id: "tr", style: { top: -5, right: -5 },                  cursor: "ne-resize" },
    { id: "r",  style: { top: "calc(50% - 5px)", right: -5 },   cursor: "e-resize"  },
    { id: "br", style: { bottom: -5, right: -5 },               cursor: "se-resize" },
    { id: "b",  style: { bottom: -5, left: "calc(50% - 5px)" }, cursor: "s-resize"  },
    { id: "bl", style: { bottom: -5, left: -5 },                cursor: "sw-resize" },
    { id: "l",  style: { top: "calc(50% - 5px)", left: -5 },    cursor: "w-resize"  },
  ];

  return (
    <div
      style={{
        position: "absolute",
        left:   `${overlay.x * 100}%`,
        top:    `${overlay.y * 100}%`,
        width:  `${overlay.w * 100}%`,
        height: `${overlay.h * 100}%`,
        cursor: "move",
        userSelect: "none",
      }}
      onMouseDown={onMoveStart}
    >
      {/* Background layer */}
      <div style={{ position: "absolute", inset: 0, borderRadius: 8, ...bg }} />

      {/* Text layer */}
      <div style={{
        position: "relative",
        zIndex: 1,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 14px",
        overflow: "hidden",
        fontSize: overlay.fontSize,
        fontFamily: font.stack,
        fontWeight: font.weight,
        color: overlay.textColor,
        textAlign: "center",
        lineHeight: 1.3,
      }}>
        <p style={{ margin: 0, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {text || <span style={{ opacity: 0.35, fontStyle: "italic" }}>No text yet</span>}
        </p>
      </div>

      {/* Selection ring */}
      {active && (
        <div style={{
          position: "absolute", inset: 0,
          border: "2px dashed oklch(0.7 0.18 35)",
          borderRadius: 8,
          pointerEvents: "none",
        }} />
      )}

      {/* Resize handles */}
      {active && HANDLES.map(({ id, style, cursor }) => (
        <div
          key={id}
          style={{
            position: "absolute",
            width: 11, height: 11,
            background: "oklch(0.99 0.01 85)",
            border: "2.5px solid oklch(0.7 0.18 35)",
            borderRadius: 3,
            cursor,
            zIndex: 20,
            ...style,
          }}
          onMouseDown={(e) => { e.stopPropagation(); onHandleStart(e, id); }}
        />
      ))}
    </div>
  );
}

// ── Section header helper ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2">
      {children}
    </p>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CanvasPage() {
  const router = useRouter();
  const { token }      = useAuth();
  const { book, setBook } = useBook();

  const [pageIdx,  setPageIdx]  = useState(0);
  const [overlay,  setOverlay]  = useState<CanvasOverlay>(DEFAULT_OVERLAY);
  const [text,     setText]     = useState("");
  const [active,   setActive]   = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);

  const canvasRef  = useRef<HTMLDivElement>(null);
  const dragRef    = useRef<{ handle: DragHandle; sx: number; sy: number; snap: CanvasOverlay } | null>(null);
  const latestRef  = useRef({ overlay, text });

  const pages = book?.pages ?? [];
  const page  = pages[pageIdx] ?? null;

  // keep latestRef in sync so the save callback captures fresh values
  useEffect(() => { latestRef.current = { overlay, text }; });

  // load page data when switching
  useEffect(() => {
    if (!page) return;
    const ov = page.canvas_overlay;
    setOverlay(ov ? { ...DEFAULT_OVERLAY, ...ov } : DEFAULT_OVERLAY);
    setText(page.text ?? "");
    setActive(true);
    setDirty(false);
  }, [pageIdx, page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave after 1.4 s of inactivity
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, 1400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (!token || !book || !page) return;
    const { overlay: ov, text: tx } = latestRef.current;
    setSaving(true);
    try {
      const updated = await api.books.updatePage(token, book.id, page.id, {
        text: tx,
        canvas_overlay: ov,
      });
      setBook(updated as unknown as BookOut);
      setDirty(false);
    } catch {
      toast.error("Failed to save — try again");
    } finally {
      setSaving(false);
    }
  }, [token, book?.id, page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchPage(idx: number) {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (dirty) save();
    setPageIdx(idx);
  }

  // ── Drag / resize ────────────────────────────────────────────────────────────

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
        case "move":
          x = clamp(s.x + dx, 0, 1 - s.w);
          y = clamp(s.y + dy, 0, 1 - s.h);
          break;
        case "br":
          w = clamp(s.w + dx, MIN_W, 1 - s.x);
          h = clamp(s.h + dy, MIN_H, 1 - s.y);
          break;
        case "bl": { const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_W);
          w = s.x + s.w - nx; x = nx;
          h = clamp(s.h + dy, MIN_H, 1 - s.y); break; }
        case "tr": { const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_H);
          h = s.y + s.h - ny; y = ny;
          w = clamp(s.w + dx, MIN_W, 1 - s.x); break; }
        case "tl": {
          const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_W);
          const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_H);
          w = s.x + s.w - nx; x = nx;
          h = s.y + s.h - ny; y = ny; break; }
        case "r":  w = clamp(s.w + dx, MIN_W, 1 - s.x); break;
        case "l":  { const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_W);
          w = s.x + s.w - nx; x = nx; break; }
        case "b":  h = clamp(s.h + dy, MIN_H, 1 - s.y); break;
        case "t":  { const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_H);
          h = s.y + s.h - ny; y = ny; break; }
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

  function patchOverlay(patch: Partial<CanvasOverlay>) {
    setOverlay(prev => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function snapTo(pos: "top" | "center" | "bottom") {
    const yMap = { top: 0.03, center: 0.35, bottom: 0.66 };
    patchOverlay({ x: 0.03, y: yMap[pos], w: 0.94 });
  }

  // ── Image ─────────────────────────────────────────────────────────────────────

  const imgUrl = page ? pageImageUrl(book!.id, page.id) : "";
  const blobUrl = useAuthImage(imgUrl, token ?? null, !!page?.has_image);

  // ── Guards ────────────────────────────────────────────────────────────────────

  if (!book) {
    return (
      <div className="flex h-screen items-center justify-center text-center px-4">
        <div>
          <p className="text-2xl font-display font-black mb-2">No book loaded</p>
          <p className="text-muted-foreground mb-4">Open a book from your library first.</p>
          <button onClick={() => router.push("/library")}
            className="rounded-full bg-primary px-5 py-2.5 font-extrabold text-primary-foreground chunky-border chunky-shadow-sm">
            Go to Library
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden select-none">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b-[2.5px] border-foreground bg-card px-4">
        <button
          onClick={() => { if (dirty) save(); router.push("/studio"); }}
          className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Editor
        </button>

        <div className="flex-1 text-center">
          <p className="font-display text-base font-black leading-none truncate max-w-xs mx-auto">{book.title}</p>
          <p className="text-[11px] text-muted-foreground font-bold">
            Canvas Editor · {page?.is_cover ? "Cover" : `Page ${page?.order}`} of {pages.filter(p => !p.is_cover).length}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Page nav in header */}
          <button onClick={() => switchPage(Math.max(0, pageIdx - 1))} disabled={pageIdx === 0}
            className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border disabled:opacity-30 hover:-translate-y-0.5 transition-transform">
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <button onClick={() => switchPage(Math.min(pages.length - 1, pageIdx + 1))} disabled={pageIdx === pages.length - 1}
            className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border disabled:opacity-30 hover:-translate-y-0.5 transition-transform">
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-extrabold text-primary-foreground chunky-border transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
          >
            {saving ? <XsSpinner /> : <Check className="h-4 w-4" strokeWidth={3} />}
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar: page thumbnails ─────────────────────────────────── */}
        <aside className="flex w-44 shrink-0 flex-col gap-0 border-r-[2.5px] border-foreground bg-card overflow-y-auto">
          <div className="p-2 space-y-2">
            {pages.map((p, i) => (
              <PageThumb
                key={p.id}
                page={p}
                bookId={book.id}
                token={token ?? ""}
                isActive={i === pageIdx}
                onClick={() => switchPage(i)}
              />
            ))}
          </div>
        </aside>

        {/* ── Center: canvas area ───────────────────────────────────────────── */}
        <main
          className="flex flex-1 flex-col items-center justify-center gap-4 overflow-auto p-6 bg-muted/20"
          onClick={() => setActive(true)}
        >
          {/* Canvas */}
          <div
            ref={canvasRef}
            className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow"
            style={{
              width: "min(660px, calc(100vw - 500px))",
              aspectRatio: "4/3",
              flexShrink: 0,
            }}
          >
            {/* Background image */}
            {blobUrl ? (
              <img
                src={blobUrl} alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <ImageIcon className="h-20 w-20 text-muted-foreground/20" strokeWidth={1} />
              </div>
            )}

            {/* Text overlay */}
            {page && (
              <TextOverlay
                overlay={overlay}
                text={text}
                active={active}
                onMoveStart={(e) => { setActive(true); startInteraction(e, "move"); }}
                onHandleStart={(e, h) => startInteraction(e, h)}
              />
            )}
          </div>

          <p className="text-[11px] font-semibold text-muted-foreground">
            Drag text box to reposition · Corner/edge handles to resize
          </p>
        </main>

        {/* ── Right panel: controls ─────────────────────────────────────────── */}
        <aside className="flex w-[280px] shrink-0 flex-col border-l-[2.5px] border-foreground bg-card overflow-y-auto">
          <div className="p-4 space-y-5">

            {/* ── Text content ── */}
            <div>
              <SectionLabel>Page Text</SectionLabel>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setDirty(true); }}
                rows={5}
                placeholder="Story text for this page…"
                className="w-full rounded-xl bg-background px-3 py-2.5 text-sm leading-relaxed chunky-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none select-text"
                style={{ fontFamily: "var(--font-sans)" }}
              />
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Font family ── */}
            <div>
              <SectionLabel>Font</SectionLabel>
              <div className="space-y-1.5">
                {READER_FONTS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => patchOverlay({ fontFamily: f.id })}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm chunky-border transition-colors",
                      overlay.fontFamily === f.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    )}
                    style={{ fontFamily: f.stack, fontWeight: f.weight }}
                  >
                    <span>{f.label}</span>
                    <span className="text-base opacity-70">{f.sample}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Font size ── */}
            <div>
              <SectionLabel>Font Size — {overlay.fontSize}px</SectionLabel>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => patchOverlay({ fontSize: Math.max(10, overlay.fontSize - 2) })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background chunky-border hover:bg-muted transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <input
                  type="range" min={10} max={56} step={1}
                  value={overlay.fontSize}
                  onChange={(e) => patchOverlay({ fontSize: parseInt(e.target.value) })}
                  className="flex-1 h-2 accent-primary"
                />
                <button
                  onClick={() => patchOverlay({ fontSize: Math.min(56, overlay.fontSize + 2) })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background chunky-border hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Text color ── */}
            <div>
              <SectionLabel>Text Color</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {TEXT_COLORS.map(({ hex }) => (
                  <button
                    key={hex}
                    onClick={() => patchOverlay({ textColor: hex })}
                    title={hex}
                    className={cn(
                      "h-8 w-8 rounded-lg chunky-border transition-all hover:scale-110",
                      overlay.textColor === hex ? "ring-2 ring-primary ring-offset-1 scale-110" : ""
                    )}
                    style={{ background: hex }}
                  />
                ))}
                {/* Custom color picker */}
                <label
                  title="Custom color"
                  className={cn(
                    "relative h-8 w-8 rounded-lg chunky-border cursor-pointer overflow-hidden hover:scale-110 transition-all",
                    !TEXT_COLORS.find(c => c.hex === overlay.textColor) ? "ring-2 ring-primary ring-offset-1 scale-110" : ""
                  )}
                  style={{ background: overlay.textColor }}
                >
                  <input
                    type="color" value={overlay.textColor}
                    onChange={(e) => patchOverlay({ textColor: e.target.value })}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Background style ── */}
            <div>
              <SectionLabel>Text Background</SectionLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: "none",     label: "None",    desc: "Transparent" },
                  { id: "frosted",  label: "Frosted", desc: "Glass blur" },
                  { id: "darkened", label: "Dark",    desc: "Dark overlay" },
                ] as const).map(({ id, label, desc }) => (
                  <button
                    key={id}
                    onClick={() => patchOverlay({ bgStyle: id })}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-xl py-2 px-1 chunky-border transition-colors text-center",
                      overlay.bgStyle === id
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    )}
                  >
                    <span className="text-xs font-extrabold">{label}</span>
                    <span className={cn("text-[9px]", overlay.bgStyle === id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {desc}
                    </span>
                  </button>
                ))}
              </div>

              {overlay.bgStyle !== "none" && (
                <div className="mt-3">
                  <SectionLabel>Opacity — {Math.round(overlay.bgOpacity * 100)}%</SectionLabel>
                  <input
                    type="range" min={0.1} max={1} step={0.05}
                    value={overlay.bgOpacity}
                    onChange={(e) => patchOverlay({ bgOpacity: parseFloat(e.target.value) })}
                    className="w-full h-2 accent-primary"
                  />
                </div>
              )}
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Snap position ── */}
            <div>
              <SectionLabel>Snap to Position</SectionLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {(["top", "center", "bottom"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => snapTo(pos)}
                    className="rounded-xl py-2 text-xs font-extrabold capitalize bg-background chunky-border hover:bg-muted transition-colors"
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t-[1.5px] border-foreground/15" />

            {/* ── Reset ── */}
            <button
              onClick={() => { setOverlay(DEFAULT_OVERLAY); setDirty(true); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold text-muted-foreground chunky-border hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2.5} /> Reset to default
            </button>

          </div>
        </aside>
      </div>
    </div>
  );
}
