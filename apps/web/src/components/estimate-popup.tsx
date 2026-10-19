"use client";

import { useMemo, useState } from "react";
import { estimateLabel } from "@/lib/fun-estimate";
import { GameArena } from "@/components/game-arena";

// Kid-friendly activities that rotate randomly each time the popup appears.
const FUN_ACTIVITIES = [
  "Stretch like a lion! 🦁",
  "Do 5 jumping jacks while we work!",
  "Grab some water and come back in a minute 💧",
  "Think of a silly character for your next story 🤪",
  "Look out the window and find 3 things you can see 👀",
  "Take 10 big steps around the room 👣",
  "Draw a quick doodle while you wait ✏️",
  "Stretch your arms and legs 🙆",
];

export function EstimatePopup({
  title,
  estimateSeconds,
  onClose,
}: {
  title: string;
  estimateSeconds: number;
  onClose: () => void;
}) {
  const label = useMemo(() => estimateLabel(estimateSeconds), [estimateSeconds]);
  const activity = useMemo(() => FUN_ACTIVITIES[Math.floor(Math.random() * FUN_ACTIVITIES.length)], []);
  const [playing, setPlaying] = useState(false);

  // The card stays open until the user clicks Okay — the estimate stays visible
  // (even while playing a game). No progress bar, no auto-dismiss.
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${playing ? "max-w-6xl" : "max-w-sm"} rounded-3xl bg-card p-6 text-center chunky-border chunky-shadow max-h-[94vh] overflow-y-auto transition-[max-width]`}>
        <h2 className="font-display text-2xl font-black">{title}</h2>
        <p className="mt-2 text-sm font-bold text-foreground">
          This may take <span className="text-primary">{label}</span> — sit tight, we&apos;ll be ready soon! 🌟
        </p>

        {/* Fun activity + game launcher — always visible, even while playing */}
        <div className="mt-4 rounded-2xl bg-highlight px-4 py-4 chunky-border">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-foreground/60">While you wait</p>
          <p className="mt-1.5 font-display text-xl font-black leading-tight text-foreground">{activity}</p>
          {!playing && (
            <>
              <p className="mt-2 text-xs font-bold text-foreground/70">…or play a game to pass the time! 🎮</p>
              <button
                onClick={() => setPlaying(true)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-extrabold text-accent-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
              >
                🎮 Play a game
              </button>
            </>
          )}
        </div>

        {playing && (
          <div className="mt-4 text-left">
            <GameArena />
          </div>
        )}

        <button onClick={onClose}
          className="mt-4 w-full rounded-full bg-primary py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
          Okay
        </button>
      </div>
    </div>
  );
}
