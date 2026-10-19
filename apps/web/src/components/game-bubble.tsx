"use client";

import { useEffect, useState } from "react";
import { X, Gamepad2 } from "lucide-react";
import { GameArena } from "@/components/game-arena";

// Floating bubble → popup with the game arena (Dino Dash, Space Shooter, Kart Dash).
export function GameBubble() {
  const [open, setOpen] = useState(false);

  // Let other parts of the app (e.g. the "estimated time" popup) launch the games.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("olivianx:play-game", openIt);
    return () => window.removeEventListener("olivianx:play-game", openIt);
  }, []);

  return (
    <>
      <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 flex items-center gap-2">
        {/* Speech bubble — hidden on small screens so it doesn't overlap content */}
        <button onClick={() => setOpen(true)} className="relative hidden rounded-2xl bg-card px-3.5 py-2 chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 sm:block">
          <span className="font-display text-sm font-black text-foreground whitespace-nowrap">Play Games…</span>
          <span className="absolute right-[-7px] top-1/2 -translate-y-1/2 h-3 w-3 rotate-45 bg-card border-r-[2.5px] border-t-[2.5px] border-foreground" />
        </button>
        <button
          onClick={() => setOpen(true)}
          aria-label="Play a quick game"
          className="grid h-12 w-12 sm:h-16 sm:w-16 place-items-center rounded-full bg-primary text-primary-foreground chunky-border chunky-shadow hover:-translate-y-1 transition-transform"
        >
          <Gamepad2 className="h-6 w-6 sm:h-8 sm:w-8" strokeWidth={2.5} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-6xl rounded-3xl bg-card p-4 sm:p-8 chunky-border chunky-shadow max-h-[94vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-2xl sm:text-3xl font-black">Game Corner 🎮✨</h2>
              <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-background chunky-border hover:-translate-y-0.5 transition-transform">
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
            <GameArena />
          </div>
        </div>
      )}
    </>
  );
}
