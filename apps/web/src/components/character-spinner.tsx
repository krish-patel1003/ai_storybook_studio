"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

interface Character {
  emoji: string;
  name: string;
  trail: string;
  anim: string;
  speed: number;
}

const CAST: Character[] = [
  { emoji: "🧙‍♂️", name: "Zap the Wizard",      trail: "✨", anim: "char-run",        speed: 2.4 },
  { emoji: "🦄",   name: "Star the Unicorn",     trail: "🌈", anim: "char-jump",       speed: 1.6 },
  { emoji: "🧚‍♀️", name: "Luna the Fairy",       trail: "⭐", anim: "char-float",      speed: 2.0 },
  { emoji: "🤖",   name: "Pixel the Robot",      trail: "⚡", anim: "char-bounce-x",   speed: 0.8 },
  { emoji: "🐉",   name: "Drake the Dragon",     trail: "🔥", anim: "char-flip",       speed: 1.2 },
  { emoji: "🦊",   name: "Fern the Fox",         trail: "🍂", anim: "char-wiggle",     speed: 0.7 },
  { emoji: "🐸",   name: "Hopscotch the Frog",   trail: "💚", anim: "char-trampoline", speed: 1.0 },
  { emoji: "🦋",   name: "Iris the Butterfly",   trail: "🌸", anim: "char-float",      speed: 1.8 },
  { emoji: "🐙",   name: "Ollie the Octopus",    trail: "💙", anim: "char-wiggle",     speed: 1.4 },
  { emoji: "🦁",   name: "Leo the Lion",         trail: "👑", anim: "char-bounce-x",   speed: 0.9 },
  { emoji: "🐧",   name: "Penny the Penguin",    trail: "❄️", anim: "char-jump",       speed: 1.3 },
  { emoji: "🦕",   name: "Rex the Dino",         trail: "🥚", anim: "char-run",        speed: 2.8 },
];

function useRotatingChar(intervalMs = 5000) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * CAST.length));
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % CAST.length), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return CAST[idx];
}

// ── xs ─ tiny inline spinner (replaces h-3/h-4 Loader2 in buttons) ──────────
export function XsSpinner({ className }: { className?: string }) {
  const char = useRotatingChar();
  return (
    <span
      aria-label="loading"
      className={cn("inline-block select-none leading-none", className)}
      style={{ animation: "char-pulse 0.55s ease-in-out infinite", fontSize: "13px" }}
    >
      {char.emoji}
    </span>
  );
}

// ── sm ─ inline-with-text spinner (replaces h-4/h-5 Loader2 beside labels) ──
export function SmSpinner({ className }: { className?: string }) {
  const char = useRotatingChar();
  return (
    <span
      aria-label="loading"
      className={cn("inline-block select-none leading-none", className)}
      style={{ animation: "char-wiggle 0.75s ease-in-out infinite", fontSize: "17px" }}
    >
      {char.emoji}
    </span>
  );
}

// ── corner ─ tiny absolute-positioned badge (replaces ring border spinners) ──
export function CornerSpinner({ className }: { className?: string }) {
  const char = useRotatingChar(3000);
  return (
    <span
      aria-label="loading"
      className={cn("select-none leading-none", className)}
      style={{ animation: "corner-spin 1.1s ease-in-out infinite", display: "inline-block", fontSize: "14px" }}
    >
      {char.trail}
    </span>
  );
}

// ── md ─ section-level spinner (replaces h-6/h-8 Loader2 in panels) ─────────
export function MdSpinner({ className }: { className?: string }) {
  const char = useRotatingChar();
  return (
    <div
      aria-label="loading"
      className={cn("relative flex flex-col items-center gap-1 select-none", className)}
    >
      <span
        className="inline-block leading-none"
        style={{
          animation: `${char.anim} ${char.speed}s ease-in-out infinite`,
          fontSize: "36px",
          willChange: "transform",
        }}
      >
        {char.emoji}
      </span>
      <span className="text-[10px] font-bold text-muted-foreground">{char.name}</span>
    </div>
  );
}

// ── lg ─ full-page character stage (replaces h-10 Loader2 page loaders) ──────
export function LgSpinner({ className }: { className?: string }) {
  const char = useRotatingChar();
  const isRunner = char.anim === "char-run";
  const hasGround = char.anim === "char-jump" || char.anim === "char-run" || char.anim === "char-trampoline";

  return (
    <div
      aria-label="loading"
      className={cn("flex flex-col items-center gap-3 select-none", className)}
    >
      <div className={cn("relative flex items-end justify-center", isRunner ? "w-60 h-24" : "w-36 h-24")}>
        {/* Floating trail particles for non-runners */}
        {!isRunner && (
          <>
            <span
              className="absolute top-1 left-2 leading-none opacity-40 text-base"
              style={{ animation: `char-float ${char.speed * 1.3}s ease-in-out infinite`, animationDelay: "0.3s", display: "inline-block" }}
            >
              {char.trail}
            </span>
            <span
              className="absolute top-5 right-3 leading-none opacity-30 text-sm"
              style={{ animation: `char-float ${char.speed * 1.6}s ease-in-out infinite`, animationDelay: "0.8s", display: "inline-block" }}
            >
              {char.trail}
            </span>
          </>
        )}

        {/* The character */}
        <span
          className="leading-none"
          style={{
            animation: `${char.anim} ${char.speed}s ${char.anim === "char-flip" ? "linear" : "ease-in-out"} infinite`,
            display: "inline-block",
            fontSize: "64px",
            willChange: "transform",
          }}
        >
          {char.emoji}
        </span>

        {/* Ground shadow */}
        {hasGround && (
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-2.5 rounded-full bg-foreground/20"
            style={{ animation: `shadow-pulse ${char.speed}s ease-in-out infinite` }}
          />
        )}
      </div>

      {/* Name badge */}
      <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 chunky-border text-xs font-extrabold text-primary">
        <span className="leading-none">{char.trail}</span>
        {char.name}
      </div>
    </div>
  );
}

// ── default export: pick by size ─────────────────────────────────────────────
export function CharacterSpinner({ size = "md", className }: { size?: SpinnerSize; className?: string }) {
  if (size === "xs") return <XsSpinner className={className} />;
  if (size === "sm") return <SmSpinner className={className} />;
  if (size === "lg") return <LgSpinner className={className} />;
  return <MdSpinner className={className} />;
}
