"use client";

import { Lightbulb, ImageIcon, Mic, BookOpen, Sparkles, X } from "lucide-react";

// Framed as outcomes, not production steps — kids think in outcomes.
const STEPS = [
  { icon: Lightbulb, label: "Tell Your Idea", desc: "Tell us what your story is about." },
  { icon: ImageIcon, label: "Make the Pictures", desc: "We'll create beautiful pictures for every page." },
  { icon: Mic, label: "Add Your Voice", desc: "Read your story in your own voice." },
  { icon: BookOpen, label: "Enjoy Your Book", desc: "Read it, share it, or print it." },
];

export function WelcomeModal({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-lg rounded-3xl bg-card p-8 chunky-border chunky-shadow">
        <button
          onClick={onSkip}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-background chunky-border hover:bg-secondary"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>

        <div className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary chunky-border chunky-shadow-sm">
            <BookOpen className="h-7 w-7 text-primary-foreground" strokeWidth={2} />
          </div>
          <h2 className="font-display text-3xl font-black">Welcome to Storybook Studio!</h2>
          <p className="mt-2 text-muted-foreground">
            Turn any idea into a fully illustrated, narrated children&apos;s book in four steps.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-start gap-3 rounded-2xl bg-background p-3 chunky-border">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-highlight chunky-border font-display text-sm font-black">
                {i + 1}
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-extrabold">
                  <s.icon className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} /> {s.label}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            onClick={onStart}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Take the tour
          </button>
          <button
            onClick={onSkip}
            className="rounded-full bg-background px-6 py-3 text-base font-extrabold chunky-border transition-transform hover:-translate-y-0.5"
          >
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
