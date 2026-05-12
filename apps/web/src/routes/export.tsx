import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { FileText, Link2, BookOpen, Check, Download, Copy } from "lucide-react";
import { mockBook } from "@/lib/mock-book";
import cover from "@/assets/cover.jpg";

export const Route = createFileRoute("/export")({
  head: () => ({
    meta: [
      { title: "Export — Storybook Studio" },
      { name: "description", content: "Export your storybook as PDF, EPUB, or share it interactively." },
    ],
  }),
  component: ExportPage,
});

const formats = [
  {
    id: "link",
    title: "Interactive link",
    desc: "Share a flippy reader anyone can open in a browser.",
    icon: Link2,
    bg: "bg-secondary",
    fg: "text-secondary-foreground",
    cta: "Copy share link",
  },
  {
    id: "pdf",
    title: "PDF",
    desc: "Print-ready 8.5×11 with cover, perfect for home printing.",
    icon: FileText,
    bg: "bg-primary",
    fg: "text-primary-foreground",
    cta: "Download PDF",
  },
  {
    id: "epub",
    title: "EPUB · Kindle",
    desc: "Reflowable e-book, ready to upload to Kindle Direct Publishing.",
    icon: BookOpen,
    bg: "bg-accent",
    fg: "text-accent-foreground",
    cta: "Download EPUB",
  },
];

function ExportPage() {
  const [picked, setPicked] = useState("pdf");
  const checks = [
    "Cover illustrated",
    `${mockBook.pages.length - 1} pages illustrated`,
    "Characters consistent across pages",
    "Reading level: Ages 3–5",
    "Safety filters passed",
  ];

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[1fr_360px]">
      <section>
        <h1 className="font-display text-4xl font-black md:text-5xl">Publish your storybook</h1>
        <p className="mt-2 text-muted-foreground">Pick a format. We'll handle layout, margins, and bleed.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {formats.map((f) => {
            const on = picked === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setPicked(f.id)}
                className={`group relative flex flex-col items-start rounded-3xl bg-card p-5 text-left chunky-border transition-transform ${
                  on ? "chunky-shadow -translate-y-1" : "chunky-shadow-sm hover:-translate-y-0.5"
                }`}
              >
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${f.bg} chunky-border`}>
                  <f.icon className={`h-6 w-6 ${f.fg}`} strokeWidth={2.5} />
                </span>
                <div className="mt-3 font-display text-2xl font-black">{f.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                {on && (
                  <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-foreground text-background">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm">
          <h2 className="font-display text-2xl font-black">Pre-flight check</h2>
          <ul className="mt-4 space-y-2">
            {checks.map((c) => (
              <li key={c} className="flex items-center gap-3 rounded-xl bg-background p-3 chunky-border">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-foreground chunky-border">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className="font-bold">{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform"
          >
            {picked === "link" ? <Copy className="h-5 w-5" strokeWidth={2.5} /> : <Download className="h-5 w-5" strokeWidth={2.5} />}
            {formats.find((f) => f.id === picked)!.cta}
          </motion.button>
          <button className="inline-flex items-center gap-1.5 rounded-full bg-background px-6 py-3 text-base font-extrabold chunky-border chunky-shadow-sm">
            Send by email
          </button>
        </div>
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm">
          <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Live preview
          </div>
          <motion.div
            animate={{ rotate: [-1, 1, -1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="mt-3 overflow-hidden rounded-2xl bg-background chunky-border chunky-shadow-sm"
          >
            <img src={cover} alt="Book cover preview" className="h-auto w-full" />
          </motion.div>
          <div className="mt-3">
            <div className="font-display text-lg font-black">{mockBook.title}</div>
            <div className="text-sm text-muted-foreground">
              {mockBook.pages.length - 1} pages · {mockBook.style} · {mockBook.ageRange}
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}