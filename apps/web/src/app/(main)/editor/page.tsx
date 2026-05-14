"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  Pencil,
  Wand2,
  Lock,
  Shuffle,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  Eye,
  Download,
  CircleDot,
  X,
  Sparkles,
} from "lucide-react";
import { mockBook, mockCharacters } from "@/lib/mock-book";

type DrawerKind = null | "text" | "image";

export default function EditorPage() {
  const [active, setActive] = useState(1);
  const [castOpen, setCastOpen] = useState(true);
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const page = mockBook.pages[active];

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b-[2.5px] border-foreground bg-card px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <input
            defaultValue={mockBook.title}
            className="min-w-0 max-w-xs rounded-lg bg-transparent px-2 py-1 font-display text-xl font-black outline-none hover:bg-background focus:bg-background"
          />
          <span className="hidden items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold text-accent-foreground chunky-border md:inline-flex">
            <CircleDot className="h-3 w-3" /> Saved
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/reader"
            className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-extrabold chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
          >
            <Eye className="h-4 w-4" strokeWidth={2.5} /> Preview
          </Link>
          <Link
            href="/export"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
          >
            <Download className="h-4 w-4" strokeWidth={2.5} /> Export
          </Link>
        </div>
      </div>

      {/* Two-pane */}
      <div className="flex flex-1 min-h-0">
        {/* Left: page thumbs */}
        <aside className="hidden w-[260px] shrink-0 flex-col overflow-y-auto border-r-[2.5px] border-foreground bg-sidebar p-3 md:flex">
          <div className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Pages
          </div>
          <ul className="space-y-2">
            {mockBook.pages.map((p, i) => (
              <li key={p.id}>
                <button
                  onClick={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left chunky-border transition-all ${
                    i === active ? "bg-primary text-primary-foreground chunky-shadow-sm" : "bg-card hover:-translate-y-0.5"
                  }`}
                >
                  <img
                    src={p.image}
                    alt={`Page ${i}`}
                    loading="lazy"
                    className="h-14 w-14 rounded-xl object-cover chunky-border"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold uppercase opacity-80">
                      {p.isCover ? "Cover" : `Page ${i}`}
                    </div>
                    <div className="truncate text-sm font-bold">{p.text}</div>
                  </div>
                </button>
              </li>
            ))}
            <li>
              <button className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-[2.5px] border-dashed border-foreground/40 px-3 py-3 text-sm font-extrabold text-foreground/60 hover:bg-card hover:text-foreground">
                <Plus className="h-4 w-4" strokeWidth={3} /> Add page
              </button>
            </li>
          </ul>
        </aside>

        {/* Right: canvas */}
        <section className="relative flex-1 overflow-y-auto bg-background p-4 md:p-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                {page.isCover ? "Cover" : `Page ${active} of ${mockBook.pages.length - 1}`}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setActive(Math.max(0, active - 1))}
                  className="rounded-full bg-card px-3 py-1 text-sm font-extrabold chunky-border"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setActive(Math.min(mockBook.pages.length - 1, active + 1))}
                  className="rounded-full bg-card px-3 py-1 text-sm font-extrabold chunky-border"
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Page canvas */}
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={page.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden rounded-3xl bg-card chunky-border chunky-shadow"
                >
                  <div className="aspect-[4/3] bg-muted">
                    <img src={page.image} alt="Page illustration" className="h-full w-full object-cover" />
                  </div>
                  <div className="border-t-[2.5px] border-foreground p-6">
                    {page.isCover ? (
                      <h2 className="text-center font-display text-4xl font-black">{page.text}</h2>
                    ) : (
                      <p className="font-display text-xl leading-relaxed">{page.text}</p>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Floating toolbar */}
              <div className="absolute -right-2 top-3 hidden flex-col gap-2 md:flex">
                <ToolBtn icon={RefreshCw} label="Regenerate image" onClick={() => setDrawer("image")} />
                <ToolBtn icon={Pencil} label="Edit text" onClick={() => setDrawer("text")} />
                <ToolBtn icon={Wand2} label="Edit prompt" onClick={() => setDrawer("image")} />
                <ToolBtn icon={Lock} label="Lock characters" />
                <ToolBtn icon={Shuffle} label="Variations" />
                <ToolBtn icon={Trash2} label="Delete" />
              </div>
            </div>

            {/* Cast strip */}
            <div className="mt-6 rounded-3xl bg-card chunky-border chunky-shadow-sm">
              <button
                onClick={() => setCastOpen(!castOpen)}
                className="flex w-full items-center justify-between p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-black">Characters</span>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-extrabold text-accent-foreground">
                    {mockCharacters.length} locked
                  </span>
                </div>
                {castOpen ? <ChevronUp /> : <ChevronDown />}
              </button>
              {castOpen && (
                <div className="grid gap-3 border-t-[2.5px] border-foreground p-4 sm:grid-cols-2">
                  {mockCharacters.map((c) => (
                    <div key={c.id} className="flex gap-3 rounded-2xl bg-background p-3 chunky-border">
                      <img src={c.image} alt={c.name} className="h-16 w-16 rounded-xl object-cover chunky-border" />
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-lg font-black leading-tight">{c.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.traits.slice(0, 3).map((t) => (
                            <span key={t} className="rounded-full bg-highlight px-2 py-0.5 text-xs font-bold">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button className="self-start rounded-full bg-card p-2 chunky-border">
                        <RefreshCw className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Right drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(null)}
              className="fixed inset-0 z-40 bg-foreground/30"
            />
            <motion.aside
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              transition={{ type: "spring", damping: 24, stiffness: 220 }}
              className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l-[2.5px] border-foreground bg-card p-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-black">
                  {drawer === "text" ? "Edit text" : "Edit illustration"}
                </h3>
                <button onClick={() => setDrawer(null)} className="rounded-full bg-background p-2 chunky-border">
                  <X className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>

              {drawer === "text" ? (
                <div className="mt-5 space-y-4">
                  <textarea
                    defaultValue={page.text}
                    rows={6}
                    className="w-full resize-none rounded-2xl bg-background p-4 font-display text-lg outline-none chunky-border focus:ring-4 focus:ring-primary/30"
                  />
                  <div>
                    <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                      Reading level
                    </div>
                    <div className="rounded-2xl bg-background p-3 chunky-border">
                      <div className="flex items-center justify-between text-sm font-bold">
                        <span>Ages 3–5</span>
                        <span className="text-accent-foreground">✓ on target</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-2/5 bg-accent" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                      Image prompt
                    </div>
                    <textarea
                      defaultValue="A small orange fox waking in a cozy burrow, morning light"
                      rows={4}
                      className="w-full resize-none rounded-2xl bg-background p-4 outline-none chunky-border focus:ring-4 focus:ring-primary/30"
                    />
                  </label>
                  <div className="flex items-center justify-between rounded-2xl bg-background p-3 chunky-border">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Lock className="h-4 w-4" /> Lock seed for consistency
                    </div>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-extrabold text-accent-foreground">
                      ON
                    </span>
                  </div>
                </div>
              )}

              <button className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-3 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow-sm">
                <Sparkles className="h-4 w-4" strokeWidth={3} /> Regenerate
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="group relative grid h-11 w-11 place-items-center rounded-full bg-card chunky-border chunky-shadow-sm hover:-translate-x-0.5 hover:bg-highlight transition-transform"
    >
      <Icon className="h-5 w-5" strokeWidth={2.5} />
      <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-bold text-background opacity-0 group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}
