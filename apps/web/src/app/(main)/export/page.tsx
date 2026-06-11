"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  FileText, Link2, BookOpen, Check, Download, Copy,
  Loader2, Rocket, ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type BookOut } from "@/lib/api";
import { BookPicker } from "@/components/book-picker";

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
    desc: "Print-ready A5 with cover, perfect for home printing.",
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

// ── Export UI (shown once a book is selected) ─────────────────────────────────

function ExportPanel({ book, onChangeBook }: { book: BookOut; onChangeBook: () => void }) {
  const { token } = useAuth();
  const [picked, setPicked] = useState("pdf");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const illustratedPages = book.pages.filter((p) => !p.is_cover && p.has_image).length;
  const totalPages = book.pages.filter((p) => !p.is_cover).length;

  const checks = [
    book.pages.some((p) => p.is_cover && p.has_image) ? "Cover illustrated" : null,
    `${illustratedPages} of ${totalPages} pages illustrated`,
    book.pages.some((p) => p.has_audio) ? "Narration audio generated" : null,
    book.age_range ? `Reading level: Ages ${book.age_range}` : null,
  ].filter(Boolean) as string[];

  async function handleDownload() {
    if (!token) return;

    if (picked === "link") {
      const url = `${window.location.origin}/read/${book.id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    setLoading(true);
    try {
      const res =
        picked === "pdf"
          ? await api.books.exportPdf(token, book.id)
          : await api.books.exportEpub(token, book.id);

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const ext = picked === "pdf" ? "pdf" : "epub";
      const filename = `${(book.brief?.title ?? book.title).replace(/\s+/g, "_")}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[1fr_360px]">
      <section>
        {/* Selected book badge + change */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 chunky-border chunky-shadow-sm">
            <BookOpen className="h-4 w-4 text-primary" strokeWidth={2.5} />
            <span className="text-sm font-extrabold truncate max-w-[200px]">
              {book.brief?.title ?? book.title}
            </span>
          </div>
          <button
            onClick={onChangeBook}
            className="inline-flex items-center gap-1.5 rounded-full bg-background px-4 py-2 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
            Change book
          </button>
        </div>

        <h1 className="font-display text-4xl font-black md:text-5xl">Publish your storybook</h1>
        <p className="mt-2 text-muted-foreground">Pick a format. We&apos;ll handle layout, margins, and bleed.</p>

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

        {checks.length > 0 && (
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
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleDownload}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
            ) : picked === "link" ? (
              <Copy className="h-5 w-5" strokeWidth={2.5} />
            ) : (
              <Download className="h-5 w-5" strokeWidth={2.5} />
            )}
            {loading
              ? "Generating…"
              : copied
              ? "Copied!"
              : formats.find((f) => f.id === picked)!.cta}
          </motion.button>

          <Link
            href="/kdp"
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-6 py-3 text-base font-extrabold chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
          >
            <Rocket className="h-5 w-5" strokeWidth={2.5} />
            Set up KDP listing
          </Link>
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
            {book.pages.find((p) => p.is_cover)?.has_image ? (
              <img
                src={`${process.env.NEXT_PUBLIC_API_URL}/books/${book.id}/pages/${book.pages.find((p) => p.is_cover)!.id}/image`}
                alt="Book cover preview"
                className="h-auto w-full"
              />
            ) : (
              <div className="flex h-48 items-center justify-center bg-muted text-muted-foreground text-sm font-bold">
                No cover yet
              </div>
            )}
          </motion.div>
          <div className="mt-3">
            <div className="font-display text-lg font-black">{book.brief?.title ?? book.title}</div>
            <div className="text-sm text-muted-foreground">
              {totalPages} pages · Ages {book.age_range ?? "?"}
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const [book, setBook] = useState<BookOut | null>(null);

  if (!book) {
    return (
      <BookPicker
        heading="Publish your storybook"
        subheading="Choose which book to export or publish."
        onSelect={setBook}
      />
    );
  }

  return <ExportPanel book={book} onChangeBook={() => setBook(null)} />;
}
