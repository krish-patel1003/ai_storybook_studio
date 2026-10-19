"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import React, { forwardRef, useRef, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeft, ImageIcon, Volume2, VolumeX, Pause, Play, Type, BookOpen, Download, Languages } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, pageImageUrl } from "@/lib/api";
import type { PageOut, BookOut } from "@/lib/api";
import { toast } from "sonner";
import { READER_FONTS, type FontId } from "@/lib/fonts";
import { useAuthImage } from "@/lib/use-auth-image";
import { LgSpinner, SmSpinner } from "@/components/character-spinner";
import type { HTMLFlipBookRef, HTMLFlipBookProps } from "react-pageflip";

const HTMLFlipBook = dynamic<HTMLFlipBookProps>(
  () => import("react-pageflip"),
  { ssr: false }
) as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<HTMLFlipBookRef>>;

// ── Reader languages (direct translation) ─────────────────────────────────────
// "en" is the original; the rest are translated on demand via the API and cached.
const READER_LANGUAGES = [
  { code: "en", name: "English", native: "English", rtl: false },
  { code: "es", name: "Spanish", native: "Español", rtl: false },
  { code: "fr", name: "French",  native: "Français", rtl: false },
  { code: "de", name: "German",  native: "Deutsch", rtl: false },
  { code: "hi", name: "Hindi",   native: "हिन्दी", rtl: false },
  { code: "ar", name: "Arabic",  native: "العربية", rtl: true },
] as const;

// ── Font size options ─────────────────────────────────────────────────────────

const FONT_SIZES = [
  { id: "xs", label: "XS", rem: 0.875 },
  { id: "s",  label: "S",  rem: 1.35 },
  { id: "m",  label: "M",  rem: 1.55 },
  { id: "l",  label: "L",  rem: 1.8  },
  { id: "xl", label: "XL", rem: 2.1  },
] as const;

type FontSizeId = typeof FONT_SIZES[number]["id"];

function useReaderFontSize(): [FontSizeId, (s: FontSizeId) => void] {
  // v2 key — resets to "xs" (14px) default; old key used "l" (28.8px)
  const STORAGE_KEY = "reader-fontsize-v2";
  const [size, setSizeState] = useState<FontSizeId>("xs");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as FontSizeId | null;
    if (saved && FONT_SIZES.find((s) => s.id === saved)) setSizeState(saved);
  }, []);
  const setSize = useCallback((s: FontSizeId) => {
    setSizeState(s);
    localStorage.setItem(STORAGE_KEY, s);
  }, []);
  return [size, setSize];
}

// ── Font options (shared from @/lib/fonts) ────────────────────────────────────

const FONTS = READER_FONTS;

function useReaderFont(): [FontId, (f: FontId) => void] {
  // v4 key — moves default from "unkempt" to "nunito"
  const STORAGE_KEY = "reader-font-v4";
  const [font, setFontState] = useState<FontId>("nunito");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as FontId | null;
    if (saved && saved !== "unkempt" && FONTS.find((f) => f.id === saved)) setFontState(saved);
  }, []);
  const setFont = useCallback((f: FontId) => {
    setFontState(f);
    localStorage.setItem(STORAGE_KEY, f);
  }, [STORAGE_KEY]);
  return [font, setFont];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const num = parseInt(full, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// ── Cover page — full-bleed image with title + author overlay ─────────────────

const CoverPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null; author: string; fontStack: string }
>(({ page, bookId, token, author, fontStack }, ref) => {
  const imgUrl = useAuthImage(pageImageUrl(bookId, page.id, page.image_version), token, page.has_image);

  return (
    <div ref={ref} className="relative overflow-hidden select-none bg-foreground" style={{ height: "100%" }}>
      {/* Full-bleed illustration */}
      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
        <ImageIcon className="h-16 w-16 opacity-20 text-white" strokeWidth={1.5} />
      </div>
      {imgUrl && (
        <img
          src={imgUrl}
          alt="Cover"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          draggable={false}
        />
      )}

      {/* Bottom gradient overlay */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "55%",
          background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,20,0.55) 40%, rgba(10,10,20,0.88) 100%)",
        }}
      />

      {/* Title + author */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-8 px-6 text-center">
        <h1
          className="text-white leading-tight drop-shadow-lg"
          style={{
            fontFamily: 'var(--font-kranky), serif',
            fontWeight: 400,
            fontSize: "clamp(1.5rem, 5vw, 2.4rem)",
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {page.text ?? ""}
        </h1>
        {author && (
          <p
            className="mt-2 text-white/75 drop-shadow"
            style={{
              fontFamily: fontStack,
              fontSize: "clamp(0.75rem, 2vw, 0.95rem)",
              textShadow: "0 1px 6px rgba(0,0,0,0.5)",
            }}
          >
            by {author}
          </p>
        )}
      </div>
    </div>
  );
});
CoverPage.displayName = "CoverPage";

// ── Story page — full-bleed image + gradient fade into text ───────────────────

type NarrationTime = { currentTime: number; duration: number } | null;

const WordHighlight = forwardRef<HTMLParagraphElement, {
  text: string;
  narrationTime: NarrationTime;
  style: React.CSSProperties;
  className?: string;
  rtl?: boolean;
}>(({ text, narrationTime, style, className, rtl = false }, ref) => {
  const words = text.split(/(\s+)/);
  const wordCount = words.filter(w => !/^\s+$/.test(w)).length;
  const currentWordIndex = narrationTime
    ? Math.floor((narrationTime.currentTime / narrationTime.duration) * wordCount)
    : -1;

  let wIdx = 0;
  return (
    <p ref={ref} dir={rtl ? "rtl" : undefined} style={style} className={className}>
      {words.map((chunk, i) => {
        if (/^\s+$/.test(chunk)) return chunk;
        const idx = wIdx++;
        const isActive = narrationTime !== null && idx === currentWordIndex;
        return (
          <span key={i} style={isActive ? {
            backgroundColor: "rgba(255, 200, 40, 0.7)",
            borderRadius: "3px",
            padding: "0 1px",
          } : undefined}>
            {chunk}
          </span>
        );
      })}
    </p>
  );
});
WordHighlight.displayName = "WordHighlight";

const StoryPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null; fontStack: string; fontSize: number; fontWeight: number; narrationTime?: NarrationTime; onReflow?: (page: PageOut) => void; rtl?: boolean }
>(({ page, bookId, token, fontStack, fontSize, fontWeight, narrationTime = null, onReflow, rtl = false }, ref) => {
  const imgUrl = useAuthImage(pageImageUrl(bookId, page.id, page.image_version), token, page.has_image);
  const textRef = useRef<HTMLParagraphElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textZoneRef = useRef<HTMLDivElement>(null);
  // Stacked-mode text band: fixed 25% of the page — matches the studio's base
  // layout (no dynamic per-page resizing, so the band is consistent everywhere).
  const textZonePct = 25;
  // When the text is longer than the band it overflows; keep it top-anchored
  // then (so the start isn't clipped) — otherwise use the chosen vertical align.
  const [textOverflows, setTextOverflows] = useState(false);
  // At the default size we don't shrink — instead we rewrite the page shorter so
  // it fits (see the stacked effect below). These guard against duplicate/looping calls.
  const reflowingRef = useRef(false);
  const reflowCountRef = useRef(0);

  // Per-page style overrides saved from studio take precedence over reader-level controls.
  // "unkempt" is treated as unset — it was the old hardcoded default, not a deliberate choice.
  const pageFontId = page.font_family && page.font_family !== "unkempt" ? page.font_family : null;
  const pageFont = pageFontId ? FONTS.find(f => f.id === pageFontId) : null;
  const effectiveFontStack  = pageFont?.stack  ?? fontStack;
  const effectiveFontWeight = pageFont?.weight ?? fontWeight;
  // page.font_size is in px; convert to rem for the reader's sizing system.
  // Treat 15 as the old default — migrate to 14 (reader XS = 0.875rem).
  const rawFontSize = page.font_size === 15 ? 14 : page.font_size;
  const effectiveFontSize   = rawFontSize ? rawFontSize / 16 : fontSize;
  const effectiveTextColor  = page.text_color ?? undefined;
  // Per-page background — matches whatever was saved in studio (Mode1Preview / Mode2Preview)
  const effectiveBgColor    = page.bg_color ?? "#faf8f3";
  const [bgR, bgG, bgB]     = hexToRgb(effectiveBgColor);

  // Auto-shrink font for overlay mode only (stacked clips like the studio does).
  useEffect(() => {
    if (page.text_mode !== 1) return; // skip for stacked (null or 2)
    const el = textRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const fit = () => {
      if (!page.text || container.clientHeight === 0) return;
      el.style.fontSize = `${effectiveFontSize}rem`;
      let px = effectiveFontSize * 16;
      const minPx = 9;
      while (el.scrollHeight > container.clientHeight && px > minPx) {
        px -= 0.5;
        el.style.fontSize = `${px}px`;
      }
      el.style.overflow = el.scrollHeight > container.clientHeight ? "hidden" : "";
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [page.text, page.text_mode, effectiveFontStack, effectiveFontSize]);

  // Default size (14px, unset): keep the font fixed and, if the text would overflow
  // the band, automatically rewrite the page shorter so it fits — no shrinking. The
  // rewrite is persisted, so it happens once and is invisible to the reader.
  // Custom size: fall back to shrinking (down to a floor) so the margin never breaks.
  const isDefaultSize = rawFontSize == null || rawFontSize === 14;
  useEffect(() => {
    if (page.text_mode === 1) return; // stacked only (null or 2/3)
    const p = textRef.current;
    const zone = textZoneRef.current;
    if (!p || !zone) return;
    const basePx = rawFontSize ?? (effectiveFontSize * 16);

    async function reflowToFit(avail: number) {
      if (!token || !onReflow || reflowingRef.current || reflowCountRef.current >= 4) return;
      const el = textRef.current;
      if (!el) return;
      const words = (page.text ?? "").trim().split(/\s+/).filter(Boolean).length;
      if (words <= 8) return; // already as short as it usefully gets
      // Estimate a word budget that fits, scaling by the height ratio with a margin.
      const ratio = avail / Math.max(1, el.scrollHeight);
      let target = Math.floor(words * ratio * 0.9);
      if (target >= words) target = words - 3;
      target = Math.max(6, target);
      reflowingRef.current = true;
      reflowCountRef.current += 1;
      try {
        const updated = await api.books.reflowPage(token, bookId, page.id, target);
        const fresh = updated.pages.find((pp) => pp.id === page.id);
        if (fresh) onReflow(fresh); // updates the store → this effect re-runs on new text
      } catch { /* non-fatal: leave the page as-is */ }
      finally { reflowingRef.current = false; }
    }

    const fit = () => {
      const avail = zone.clientHeight - 32; // minus the 16px top/bottom padding
      if (avail <= 0 || !page.text) return;
      p.style.fontSize = `${basePx}px`;

      if (isDefaultSize) {
        // Never shrink — rewrite instead if it doesn't fit at the default size.
        if (p.scrollHeight > avail) reflowToFit(avail);
        setTextOverflows(false);
        return;
      }

      // Custom size: shrink to a floor so the margin is preserved.
      let px = basePx;
      const minPx = 9;
      while (p.scrollHeight > avail && px > minPx) {
        px -= 0.5;
        p.style.fontSize = `${px}px`;
      }
      const ov = p.scrollHeight > avail; // still too long even at the floor
      setTextOverflows((prev) => (prev === ov ? prev : ov));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(zone);
    return () => ro.disconnect();
  }, [page.text, page.text_mode, page.id, bookId, token, onReflow, effectiveFontStack, effectiveFontSize, rawFontSize, isDefaultSize]);

  const textZone     = "38%";
  const gradientZone = "47%";
  const tPos   = page.text_position ?? "bottom";
  const tAlign = (page.text_align ?? "center") as React.CSSProperties["textAlign"];
  const isStacked = page.text_mode !== 1; // null (unsaved) and 2 both default to stacked
  const isTextBottom = tPos !== "top";

  // ── Stacked layout (Mode 2): image (top 72%) + text (bottom 28%) ─────────────
  // Uses absolute positioning so layout works regardless of whether react-pageflip
  // gives the page element a CSS-definite height.
  // Text zone is 28% (not 20%) because reader pages are narrower than studio preview,
  // causing more line-wraps; 20% clips text that fits fine in studio.
  if (isStacked) {
    const TEXT_PCT = `${textZonePct}%`;
    const IMG_PCT  = `${100 - textZonePct}%`;
    const imgTop    = isTextBottom ? "0%"      : TEXT_PCT;
    const imgBottom = isTextBottom ? TEXT_PCT   : "0%";
    const txtTop    = isTextBottom ? IMG_PCT    : "0%";
    const txtBottom = isTextBottom ? "0%"       : IMG_PCT;

    return (
      <div ref={ref} className="relative overflow-hidden select-none"
        style={{ height: "100%", background: effectiveBgColor }}>

        {/* Image zone. object-cover fills the area edge-to-edge with no margins;
            center positioning crops evenly from top and bottom (least detail lost). */}
        <div style={{ position: "absolute", top: imgTop, bottom: imgBottom, left: 0, right: 0, overflow: "hidden", background: effectiveBgColor }}>
          {imgUrl ? (
            <img src={imgUrl} alt={`Page ${page.order}`}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
              style={{ objectPosition: "center" }} draggable={false} />
          ) : (
            <div className="absolute inset-0 bg-muted flex items-center justify-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground/20" strokeWidth={1} />
            </div>
          )}
          {/* Gradient blending into the text area — only for explicit "Blended"
              (mode 2). Clear separation (mode 3) and the default (null) omit it. */}
          {page.text_mode === 2 && (
            <div style={{
              position: "absolute", left: 0, right: 0, height: "20%",
              [isTextBottom ? "bottom" : "top"]: 0,
              background: isTextBottom
                ? `linear-gradient(to bottom, transparent, ${effectiveBgColor})`
                : `linear-gradient(to top, transparent, ${effectiveBgColor})`,
            }} />
          )}
        </div>

        {/* Text — dynamic-height band, anchored to the bottom of the page */}
        <div ref={textZoneRef} style={{
          position: "absolute", top: txtTop, bottom: txtBottom, left: 0, right: 0,
          background: effectiveBgColor,
          display: "flex",
          // Vertical alignment chosen in studio; fall back to top when overflowing so the start isn't clipped.
          alignItems: textOverflows ? "flex-start"
            : (page.text_valign === "top" ? "flex-start" : page.text_valign === "bottom" ? "flex-end" : "center"),
          justifyContent: "center",
          padding: "16px 20px", overflow: "hidden",
        }}>
          {page.text ? (
            <WordHighlight
              ref={textRef}
              text={page.text}
              narrationTime={narrationTime}
              rtl={rtl}
              style={{
                margin: 0, width: "100%", maxHeight: "100%", overflow: "hidden",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                fontFamily: effectiveFontStack, fontWeight: effectiveFontWeight,
                fontSize: `${(rawFontSize ?? (effectiveFontSize * 16))}px`,
                lineHeight: 1.6, textAlign: tAlign,
                color: effectiveTextColor ?? "#1a1a2e",
              }}
            />
          ) : (
            <p className="italic text-muted-foreground text-sm" style={{ fontFamily: effectiveFontStack }}>No text yet</p>
          )}
        </div>

        <div className="absolute bottom-1.5 right-3 text-[10px] font-bold text-foreground/30 select-none">{page.order}</div>
      </div>
    );
  }

  // ── Overlay layout (Mode 1, default) ────────────────────────────────────────
  return (
    <div ref={ref} className="relative overflow-hidden select-none" style={{ height: "100%", background: effectiveBgColor }}>
      {/* Full-bleed illustration — placeholder always rendered, image fades in over it */}
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        <ImageIcon className="h-12 w-12 opacity-20" strokeWidth={1.5} />
      </div>
      {imgUrl && (
        <img
          src={imgUrl}
          alt={`Page ${page.order}`}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          style={{ objectPosition: "center top" }}
          draggable={false}
        />
      )}

      {/* Gradient blending layer — direction follows text position */}
      {(() => {
        const gradStyle: React.CSSProperties =
          tPos === "top"    ? { top: 0, bottom: "auto", background: `linear-gradient(to top, transparent 0%, transparent 22%, rgba(${bgR},${bgG},${bgB},0.30) 42%, rgba(${bgR},${bgG},${bgB},0.78) 62%, rgba(${bgR},${bgG},${bgB},0.96) 78%, ${effectiveBgColor} 90%)` } :
          tPos === "center" ? { top: "26%", bottom: "26%", background: `radial-gradient(ellipse at center, rgba(${bgR},${bgG},${bgB},0.90) 30%, transparent 90%)` } :
          { bottom: 0, top: "auto", background: `linear-gradient(to bottom, transparent 0%, transparent 22%, rgba(${bgR},${bgG},${bgB},0.30) 42%, rgba(${bgR},${bgG},${bgB},0.78) 62%, rgba(${bgR},${bgG},${bgB},0.96) 78%, ${effectiveBgColor} 90%)` };
        return (
          <div
            className="absolute inset-x-0 pointer-events-none"
            style={{ height: gradientZone, ...gradStyle }}
          />
        );
      })()}

      {/* Text area — position follows page.text_position */}
      {(() => {
        const posStyle: React.CSSProperties =
          tPos === "top"    ? { top: 0, bottom: "auto" } :
          tPos === "center" ? { top: "31%", bottom: "31%" } :
          { bottom: 0, top: "auto" };
        const justifyClass =
          tPos === "top"    ? "justify-start" :
          tPos === "center" ? "justify-center" :
          "justify-end";
        return (
          <div
            ref={containerRef}
            className={`absolute inset-x-0 flex flex-col items-center ${justifyClass} overflow-hidden`}
            style={{ height: textZone, padding: "24px", ...posStyle }}
          >
            {page.text ? (
              <WordHighlight
                ref={textRef}
                text={page.text}
                narrationTime={narrationTime}
              rtl={rtl}
                className="text-foreground w-full"
                style={{ fontFamily: effectiveFontStack, fontSize: `${effectiveFontSize}rem`, fontWeight: effectiveFontWeight, lineHeight: 1.85, textAlign: tAlign, margin: 0, ...(effectiveTextColor ? { color: effectiveTextColor } : {}) }}
              />
            ) : (
              <p className="italic text-muted-foreground text-sm" style={{ fontFamily: effectiveFontStack }}>
                No text yet
              </p>
            )}
          </div>
        );
      })()}

      {/* Chapter label — top right, from narrative role */}
      {page.narrative_role && (
        <div className="absolute top-3 right-3 select-none pointer-events-none max-w-[55%] text-right">
          <span
            style={{
              fontFamily: effectiveFontStack,
              fontSize: "0.6rem",
              fontWeight: 400,
              letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.72)",
              textShadow: "0 1px 4px rgba(0,0,0,0.55)",
              lineHeight: 1.3,
            }}
          >
            {page.narrative_role}
          </span>
        </div>
      )}

      {/* Page number — subtle, bottom right */}
      <div className="absolute bottom-1.5 right-3 text-[10px] font-bold text-foreground/30 select-none">
        {page.order}
      </div>
    </div>
  );
});
StoryPage.displayName = "StoryPage";

// ── Back cover ────────────────────────────────────────────────────────────────

const BackCoverPage = forwardRef<
  HTMLDivElement,
  { page: PageOut; bookId: string; token: string | null; title: string }
>(({ page, bookId, token, title }, ref) => {
  const imgUrl = useAuthImage(pageImageUrl(bookId, page.id, page.image_version), token, page.has_image);
  return (
    <div ref={ref} className="relative overflow-hidden select-none" style={{ height: "100%", background: "#1a1a2e" }}>
      {imgUrl && (
        <img
          src={imgUrl}
          alt="Back cover"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
      {/* Dark overlay so text is legible over any illustration */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(10,10,20,0.88) 0%, rgba(10,10,20,0.45) 50%, transparent 100%)" }} />
      {/* "The End" text */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-10 text-center">
        <p className="font-display text-2xl font-black text-white tracking-wide" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>The End</p>
        <p className="text-xs font-bold text-white/60 max-w-[160px] leading-relaxed" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{title}</p>
      </div>
      <p className="absolute bottom-2 right-3 text-[10px] font-bold text-white/20 tracking-widest uppercase select-none">OlivianX</p>
    </div>
  );
});
BackCoverPage.displayName = "BackCoverPage";

// ── Font picker popover ───────────────────────────────────────────────────────

function FontPicker({ font, setFont }: { font: FontId; setFont: (f: FontId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeFont = FONTS.find((f) => f.id === font) ?? FONTS[0];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Change font"
        className="flex items-center gap-1.5 rounded-full bg-card px-3 h-8 chunky-border transition-transform hover:-translate-y-0.5 text-xs font-extrabold"
      >
        <Type className="h-3.5 w-3.5" strokeWidth={2.5} />
        <span style={{ fontFamily: activeFont.stack, fontWeight: activeFont.weight }}>
          {activeFont.label}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-card p-2 chunky-border chunky-shadow z-50">
          <p className="px-2 pb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Story font
          </p>
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => { setFont(f.id); setOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                font === f.id ? "bg-primary text-primary-foreground" : "hover:bg-accent/40"
              }`}
            >
              <span
                className="text-xl w-8 shrink-0 text-center"
                style={{ fontFamily: f.stack, fontWeight: f.weight, lineHeight: 1 }}
              >
                Aa
              </span>
              <span
                className="text-sm leading-tight"
                style={{ fontFamily: f.stack, fontWeight: f.weight }}
              >
                {f.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Font size picker ──────────────────────────────────────────────────────────

function FontSizePicker({ size, setSize }: { size: FontSizeId; setSize: (s: FontSizeId) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-card px-1.5 h-8 chunky-border">
      {FONT_SIZES.map((s) => (
        <button
          key={s.id}
          onClick={() => setSize(s.id)}
          title={`Font size ${s.label}`}
          className={`h-6 w-7 rounded-full text-xs font-extrabold transition-all ${
            size === s.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-highlight"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Audio player hook ─────────────────────────────────────────────────────────
//
// Playback sequence per spread:
//   1. Left page (currentPage) audio plays automatically when blob is ready.
//   2. When left ends → play right page (currentPage + 1) if it has audio.
//   3. When right ends (or no right audio) → auto-flip to next page after 1s.
//
// Uses a single stable "ended" listener that reads live context via a ref
// to avoid stale-closure issues.

function usePageAudio(
  pages: PageOut[],
  currentPage: number,
  bookId: string,
  token: string | null,
  bookRef: React.RefObject<HTMLFlipBookRef | null>,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const cache = useRef<Map<string, string>>(new Map());
  const [cacheVersion, setCacheVersion] = useState(0);

  // Live context for the stable "ended" callback — updated every render.
  const ctx = useRef({ currentPage, pages, muted, playingRight: false });
  ctx.current.currentPage = currentPage;
  ctx.current.pages = pages;
  ctx.current.muted = muted;

  const currentPageData = pages[currentPage] ?? null;
  const hasAudio = !!currentPageData?.has_audio;

  // Pre-fetch current spread + one spread ahead (4 pages).
  useEffect(() => {
    if (!token || !bookId) return;
    const candidates = [
      pages[currentPage],
      pages[currentPage + 1],
      pages[currentPage + 2],
      pages[currentPage + 3],
    ].filter((p): p is PageOut => !!p?.has_audio && !cache.current.has(p.id));

    for (const page of candidates) {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/books/${bookId}/pages/${page.id}/audio`;
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob) {
            cache.current.set(page.id, URL.createObjectURL(blob));
            setCacheVersion((v) => v + 1);
          }
        })
        .catch(() => {});
    }
  }, [currentPage, pages, bookId, token]);

  // Play left-page audio as soon as its blob is ready.
  useEffect(() => {
    const audio = audioRef.current;

    // Guard: when the prefetcher caches upcoming pages, cacheVersion increments.
    // Don't interrupt right-page audio that's already playing — the onEnded
    // handler will call doFlip() when it's done. Only reset on a real page change.
    if (ctx.current.playingRight) return;

    ctx.current.playingRight = false;

    if (!audio || !currentPageData?.has_audio) {
      audio?.pause();
      setPlaying(false);
      return;
    }
    const blobUrl = cache.current.get(currentPageData.id);
    if (!blobUrl) { setPlaying(false); return; }

    if (audio.src !== blobUrl) { audio.src = blobUrl; audio.load(); }
    if (!muted) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentPageData?.id, cacheVersion]);

  // NOTE: the cover never auto-advances. The reader turns the page from the
  // cover themselves; narration (if any) then begins on page 1. Previously the
  // cover auto-flipped after 1.8s, which felt like an unwanted auto-turn even
  // when no narration was playing.

  // Single stable "ended" listener — handles left→right→flip sequence.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const doFlip = () => {
      setTimeout(() => {
        ctx.current.playingRight = false;
        bookRef.current?.pageFlip().flipNext();
      }, 800);
    };

    const onEnded = () => {
      setPlaying(false);
      if (ctx.current.muted) { ctx.current.playingRight = false; return; }

      if (!ctx.current.playingRight) {
        // Cover page is shown alone (showCover=true) — no right-page partner.
        // Flip directly instead of playing the next page's audio prematurely.
        if (ctx.current.currentPage === 0) { doFlip(); return; }

        const rightPage = ctx.current.pages[ctx.current.currentPage + 1];
        if (rightPage?.has_audio) {
          const blobUrl = cache.current.get(rightPage.id);
          if (blobUrl) {
            ctx.current.playingRight = true;
            audio.src = blobUrl;
            audio.load();
            audio.play()
              .then(() => setPlaying(true))
              .catch(() => doFlip());
            return;
          }
        }
        doFlip();
      } else {
        doFlip();
      }
    };

    const onPause = () => setPlaying(false);
    const onPlay  = () => setPlaying(true);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play",  onPlay);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play",  onPlay);
    };
  }, []); // intentionally empty — all state read via ctx ref

  // Track narration position for word-level text highlighting.
  const [narrationPos, setNarrationPos] = useState<{ pageId: string; currentTime: number; duration: number } | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      if (!audio.duration || isNaN(audio.duration)) return;
      const pageId = ctx.current.playingRight
        ? (ctx.current.pages[ctx.current.currentPage + 1]?.id ?? "")
        : (ctx.current.pages[ctx.current.currentPage]?.id ?? "");
      setNarrationPos({ pageId, currentTime: audio.currentTime, duration: audio.duration });
    };
    const onEnded = () => setNarrationPos(null);
    const onPause = () => setNarrationPos(null);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (audioRef.current) audioRef.current.muted = !m;
      return !m;
    });
  }, []);

  return { audioRef, playing, muted, hasAudio, togglePlay, toggleMute, narrationPos };
}

// ── Reader ────────────────────────────────────────────────────────────────────

import { Suspense } from "react";

// ── Export modal (full functionality — same options as Parent mode) ────────────
function ExportModal({ book, token, fontFamily, onClose }: { book: BookOut; token: string; fontFamily: string; onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  async function dl(type: "pdf" | "epub" | "cover") {
    setLoading(true);
    try {
      const res = type === "pdf"   ? await api.books.exportPdf(token, book.id, fontFamily)
                : type === "cover" ? await api.books.exportCoverImage(token, book.id, "png")
                :                    await api.books.exportEpub(token, book.id, fontFamily);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const name = (book.brief?.title ?? book.title).replace(/\s+/g, "_");
      const ext  = type === "epub" ? "epub" : type === "cover" ? "png" : "pdf";
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
            { id: "cover"as const, label: "Cover Image (PNG)", desc: "Front cover as an image" },
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
        {loading && <p className="mt-3 text-center text-xs text-muted-foreground font-bold">Generating…</p>}
      </div>
    </div>
  );
}

function ReaderInner() {
  const searchParams = useSearchParams();
  const { token, user } = useAuth();
  const { book, hydrated, setBook, mergePages } = useBook();
  const [loadingLast, setLoadingLast] = useState(false);

  // Resolve where the back button should go
  const fromParam = searchParams.get("from");
  const backHref = fromParam === "editor" ? "/editor" : fromParam === "studio" ? "/studio" : "/library";
  const backLabel = fromParam === "editor" ? "Editor" : fromParam === "studio" ? "Parent mode" : "Library";
  const bookRef = useRef<HTMLFlipBookRef>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [font, setFont] = useReaderFont();
  const [fontSizeId, setFontSizeId] = useReaderFontSize();
  const [showExport, setShowExport] = useState(false);

  // ── Reader translation (direct translation toggle) ──
  const [lang, setLang] = useState("en");
  const [translations, setTranslations] = useState<Record<string, string> | null>(null);
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const currentLang = READER_LANGUAGES.find((l) => l.code === lang) ?? READER_LANGUAGES[0];
  const translationActive = lang !== "en";
  const isRtl = currentLang.rtl;

  async function changeLanguage(code: string) {
    if (code === lang) return;
    if (code === "en") { setLang("en"); setTranslations(null); setTranslatedTitle(null); return; }
    if (!book || !token) return;
    setTranslating(true);
    try {
      const res = await api.books.translate(token, book.id, code);
      setTranslations(res.pages);
      setTranslatedTitle(res.title);
      setLang(code);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't translate this book. Please try again.");
    } finally {
      setTranslating(false);
    }
  }

  // No book in the store (e.g. opened /reader directly) → open the last-edited book.
  useEffect(() => {
    if (!hydrated || book || !token || loadingLast) return;
    let cancelled = false;
    setLoadingLast(true);
    (async () => {
      try {
        const list = await api.books.list(token);
        const last = list
          .filter((b) => b.stage !== "pending")
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
        if (!last) return; // no readable books → fall through to empty state
        const full = await api.books.get(token, last.id);
        if (!cancelled) setBook(full);
      } catch {
        /* leave empty state to offer the library */
      } finally {
        if (!cancelled) setLoadingLast(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated, book, token, loadingLast, setBook]);

  const pages = book ? [...book.pages].sort((a, b) => a.order - b.order) : [];
  const totalPages = pages.length;

  const { audioRef, playing, muted, hasAudio, togglePlay, toggleMute, narrationPos } =
    usePageAudio(pages, currentPage, book?.id ?? "", token, bookRef);

  const bookHasAnyAudio = pages.some((p) => p.has_audio);
  const narrationVoices = [...new Set(pages.filter((p) => p.has_audio && p.narration_voice).map((p) => p.narration_voice))];
  const narrationVoiceLabel = narrationVoices.length === 1 ? narrationVoices[0] : narrationVoices.length > 1 ? "Multiple voices" : null;
  const activeFont = FONTS.find((f) => f.id === font) ?? FONTS[0];
  const fontStack  = activeFont.stack;
  const fontWeight = activeFont.weight;
  const fontSize   = FONT_SIZES.find((s) => s.id === fontSizeId)?.rem ?? 1.8;
  const penName = book?.author_name || user?.username || "";

  // No book yet: while hydrating or fetching the last-edited book, show a loader.
  if (!book && (!hydrated || loadingLast)) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-4 px-6 text-center">
        <LgSpinner />
        <p className="text-sm font-bold text-muted-foreground">Opening your last book…</p>
      </main>
    );
  }

  // Genuinely no readable book (new user with none) → offer the library.
  if (!book) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-card chunky-border chunky-shadow">
          <BookOpen className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="font-display text-3xl font-black">No book yet</h1>
          <p className="mt-2 text-muted-foreground">Create a storybook, then come back to read it here.</p>
        </div>
        <Link
          href="/library"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
        >
          Go to Library
        </Link>
      </main>
    );
  }

  function goNext() { bookRef.current?.pageFlip().flipNext(); }
  function goPrev() { bookRef.current?.pageFlip().flipPrev(); }

  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col bg-background overflow-hidden">
      <audio ref={audioRef} />
      {showExport && token && book && (
        <ExportModal book={book} token={token} fontFamily={font} onClose={() => setShowExport(false)} />
      )}

      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between border-b-[2px] border-foreground/20 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-extrabold chunky-border transition-transform hover:-translate-y-0.5"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={3} />
            {backLabel}
          </Link>
          <span className="font-display text-base font-black md:text-lg" dir={isRtl ? "rtl" : undefined}>
            {translationActive && translatedTitle ? translatedTitle : (book.brief?.title ?? book.title)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Language toggle — read the book in another language (direct translation) */}
          <label
            title="Read in another language"
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 chunky-border transition-transform hover:-translate-y-0.5"
          >
            <Languages className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            <select
              value={lang}
              onChange={(e) => changeLanguage(e.target.value)}
              disabled={translating}
              className="max-w-[92px] cursor-pointer bg-transparent text-xs font-extrabold outline-none disabled:opacity-50"
            >
              {READER_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native}</option>
              ))}
            </select>
            {translating && <SmSpinner />}
          </label>
          {bookHasAnyAudio && !translationActive && narrationVoiceLabel && (
            <span
              title="Narration voice"
              className="hidden sm:inline-flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-xs font-bold chunky-border"
            >
              🎙️ {narrationVoiceLabel}
            </span>
          )}
          {bookHasAnyAudio && !translationActive && (
            <button
              onClick={toggleMute}
              title={muted ? "Unmute narration" : "Mute narration"}
              className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border transition-transform hover:-translate-y-0.5"
            >
              {muted
                ? <VolumeX className="h-4 w-4" strokeWidth={2.5} />
                : <Volume2 className="h-4 w-4" strokeWidth={2.5} />}
            </button>
          )}
          <button
            onClick={() => setShowExport(true)}
            title="Export"
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-extrabold chunky-border transition-transform hover:-translate-y-0.5"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
            Export
          </button>
          <span className="text-sm font-bold text-muted-foreground">
            {currentPage === 0 ? "Cover"
              : currentPage === totalPages - 1 ? "The End"
              : `Page ${currentPage} of ${totalPages - 2}`}

          </span>
        </div>
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
          {pages.map((page) => {
            // When a translation is active, swap the page text for the translated
            // copy (falling back to the original) so all existing layout/overflow
            // logic keeps working. Narration highlighting is disabled since the
            // audio is in the original language.
            const display = translationActive && translations
              ? { ...page, text: translations[page.id] ?? page.text }
              : page;
            return page.is_cover ? (
              <CoverPage key={page.id} page={display} bookId={book.id} token={token} author={penName} fontStack={fontStack} />
            ) : page.is_back_cover ? (
              <BackCoverPage key={page.id} page={display} bookId={book.id} token={token} title={translationActive && translatedTitle ? translatedTitle : (book.brief?.title ?? book.title)} />
            ) : (
              <StoryPage key={page.id} page={display} bookId={book.id} token={token} fontStack={fontStack} fontSize={fontSize} fontWeight={fontWeight}
                rtl={isRtl}
                onReflow={(p) => mergePages([p])}
                narrationTime={!translationActive && narrationPos?.pageId === page.id ? { currentTime: narrationPos.currentTime, duration: narrationPos.duration } : null} />
            );
          })}
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

          <div className="flex items-center gap-3">
            {hasAudio && !muted && !translationActive && (
              <button
                onClick={togglePlay}
                className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
              >
                {playing
                  ? <Pause className="h-4 w-4" strokeWidth={3} />
                  : <Play  className="h-4 w-4" strokeWidth={3} />}
              </button>
            )}

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

import { useRequireAuth } from "@/lib/use-require-auth";

export default function ReaderPage() {
  useRequireAuth();
  return (
    <Suspense>
      <ReaderInner />
    </Suspense>
  );
}
