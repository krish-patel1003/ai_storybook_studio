"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, BookOpen, Rocket, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { XsSpinner } from "@/components/character-spinner";

type Kind = "pdf" | "epub" | "cover-standard" | "cover-editor";

const OPTIONS: { id: Kind; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "pdf", label: "Full Book PDF", icon: FileText, hint: "Print-ready, cover + all pages" },
  { id: "epub", label: "Kindle Edition (EPUB)", icon: Rocket, hint: "Reflowable e-book for KDP" },
  { id: "cover-standard", label: "Kindle Ebook Cover — Standard", icon: BookOpen, hint: "JPG with title & author" },
  { id: "cover-editor", label: "Kindle Ebook Cover — Editor", icon: BookOpen, hint: "Clean PNG, no text" },
];

/** Self-contained Export dropdown for a single book (PDF / cover / EPUB). */
export function BookExportMenu({ bookId, title, align = "left" }: { bookId: string; title: string; align?: "left" | "right" }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function download(kind: Kind) {
    if (!token || busy) return;
    setBusy(kind);
    try {
      const res =
        kind === "pdf"            ? await api.books.exportPdf(token, bookId, "unkempt")
        : kind === "cover-standard" ? await api.books.exportCoverImage(token, bookId, "jpeg", true)
        : kind === "cover-editor"   ? await api.books.exportCoverImage(token, bookId, "png", false)
        :                             await api.books.exportEpub(token, bookId, "unkempt");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const ext = kind === "epub" ? "epub" : kind === "cover-standard" ? "jpg" : kind === "cover-editor" ? "png" : "pdf";
      const suffix = kind === "cover-standard" ? "_cover" : kind === "cover-editor" ? "_cover_editor" : "";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${title.replace(/\s+/g, "_")}${suffix}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setOpen(false);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-2 text-xs font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
      >
        <Download className="h-4 w-4" strokeWidth={2.5} />
        Export
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.5} />
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} className={`absolute z-30 mt-2 w-64 rounded-2xl bg-card p-2 chunky-border chunky-shadow ${align === "right" ? "right-0" : "left-0"}`}>
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => download(opt.id)}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-highlight chunky-border">
                  {busy === opt.id ? <XsSpinner /> : <Icon className="h-4 w-4" strokeWidth={2.5} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold leading-tight">{opt.label}</span>
                  <span className="block text-xs font-medium text-muted-foreground leading-tight">{opt.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
