"use client";

import { Check, ChevronRight } from "lucide-react";

// The full storybook journey. Steps 0–3 live on the create page; step 4
// (Draw My Pictures) is the editor, and step 5 (Add My Voice) is the narrate page.
export const CREATE_STEPS = [
  { id: "input",    label: "💡 My Idea"          },
  { id: "concept",  label: "🌟 Imagine My Story" },
  { id: "brief",    label: "📋 Plan My Book"     },
  { id: "review",   label: "📖 Write My Pages"   },
  { id: "pictures", label: "🎨 Draw My Pictures" },
  { id: "voice",    label: "🎤 Add My Voice"     },
] as const;

export function StepBar({ currentIdx }: { currentIdx: number }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {CREATE_STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.id} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold transition-all chunky-border ${active ? "bg-primary text-primary-foreground" : done ? "bg-foreground text-background" : "bg-card text-muted-foreground"}`}>
              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className="tabular-nums">{i + 1}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < CREATE_STEPS.length - 1 && (
              <ChevronRight className={`h-3 w-3 shrink-0 ${i < currentIdx ? "text-foreground" : "text-muted-foreground/40"}`} strokeWidth={2.5} />
            )}
          </div>
        );
      })}
    </div>
  );
}
