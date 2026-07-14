"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Sparkles, ImageIcon, Mic, BookOpen, X, PlayCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

interface Item {
  icon: typeof Sparkles;
  label: string;
  href: string;
  done: boolean;
}

export function GettingStartedChecklist({
  onClose,
  onReplayTour,
}: {
  onClose: () => void;
  onReplayTour: () => void;
}) {
  const { token } = useAuth();
  const [createdDone, setCreatedDone] = useState(false);
  const [illustratedDone, setIllustratedDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.books
      .list(token)
      .then((books) => {
        if (cancelled) return;
        setCreatedDone(books.length > 0);
        setIllustratedDone(books.some((b) => b.illustrated_page_count > 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const items: Item[] = [
    { icon: Sparkles, label: "Create your first book", href: "/create", done: createdDone },
    { icon: ImageIcon, label: "Illustrate the pages", href: "/editor", done: illustratedDone },
    { icon: Mic, label: "Add narration", href: "/editor", done: false },
    { icon: BookOpen, label: "Read & export", href: "/reader", done: false },
  ];
  const completed = items.filter((i) => i.done).length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl bg-card p-4 chunky-border chunky-shadow">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-lg font-black">Getting started</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 place-items-center rounded-full bg-background chunky-border hover:bg-secondary"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs font-bold text-muted-foreground">
          <span>{completed} of {items.length} done</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted chunky-border">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(completed / items.length) * 100}%` }}
          />
        </div>
      </div>

      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.label}>
            <Link
              href={it.href}
              onClick={onClose}
              className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-bold transition-colors hover:bg-highlight"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full chunky-border ${
                  it.done ? "bg-accent text-accent-foreground" : "bg-background text-muted-foreground"
                }`}
              >
                {it.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <it.icon className="h-3.5 w-3.5" strokeWidth={2.5} />}
              </span>
              <span className={it.done ? "text-muted-foreground line-through" : ""}>{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <button
        onClick={onReplayTour}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-background py-2 text-sm font-extrabold chunky-border transition-transform hover:-translate-y-0.5"
      >
        <PlayCircle className="h-4 w-4" strokeWidth={2.5} /> Replay the tour
      </button>
    </div>
  );
}
