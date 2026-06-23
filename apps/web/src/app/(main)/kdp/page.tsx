"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Check, Copy, ExternalLink, RefreshCw, Rocket,
  BookOpen, Pencil, X, Plus, ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type KDPOut, type BookOut } from "@/lib/api";
import { BookPicker } from "@/components/book-picker";
import { XsSpinner, SmSpinner } from "@/components/character-spinner";

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ value, small }: { value: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const size = small ? "h-6 w-6" : "h-8 w-8";
  const icon = small ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className={`shrink-0 grid ${size} place-items-center rounded-full transition-all chunky-border ${
        copied ? "bg-accent text-accent-foreground" : "bg-card hover:bg-highlight"
      }`}
    >
      {copied
        ? <Check className={icon} strokeWidth={3} />
        : <Copy className={icon} strokeWidth={2.5} />}
    </button>
  );
}

// ── Editable field row ────────────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  hint,
  multiline = false,
  onSave,
}: {
  label: string;
  value: string;
  hint?: string;
  multiline?: boolean;
  onSave: (newVal: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  // Keep draft in sync if parent updates value (e.g. after regenerate)
  useEffect(() => { setDraft(value); }, [value]);

  const plainValue = value.replace(/<[^>]*>/g, "");
  const isLong = plainValue.length > 180;
  const displayPlain = isLong && !expanded ? plainValue.slice(0, 180) + "…" : plainValue;

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!multiline && e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") cancel();
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-background px-4 py-3 chunky-border">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {hint && (
            <span className="text-xs text-muted-foreground/60 font-medium">· {hint}</span>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            {multiline ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={6}
                className="w-full rounded-xl border-2 border-primary bg-background p-2 text-sm font-bold leading-relaxed resize-y focus:outline-none"
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                className="w-full rounded-xl border-2 border-primary bg-background px-2 py-1.5 text-sm font-bold focus:outline-none"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={commit}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-3 h-7 text-xs font-extrabold text-primary-foreground chunky-border"
              >
                <Check className="h-3 w-3" strokeWidth={3} /> Save
              </button>
              <button
                onClick={cancel}
                className="inline-flex items-center gap-1 rounded-full bg-card px-3 h-7 text-xs font-extrabold chunky-border"
              >
                <X className="h-3 w-3" strokeWidth={3} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={`text-sm font-bold leading-relaxed break-words ${multiline ? "" : "line-clamp-3"}`}>
              {displayPlain}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-1 text-xs font-extrabold text-primary hover:underline"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </>
        )}
      </div>

      {!editing && (
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={startEdit}
            title="Edit"
            className="grid h-8 w-8 place-items-center rounded-full bg-card hover:bg-highlight transition-all chunky-border"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <CopyButton value={multiline ? value : plainValue} />
        </div>
      )}
    </div>
  );
}

// ── Editable keywords row ─────────────────────────────────────────────────────

function KeywordsRow({
  keywords,
  onSave,
}: {
  keywords: string[];
  onSave: (kws: string[]) => void;
}) {
  const [chips, setChips] = useState(keywords);
  const [newKw, setNewKw] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { setChips(keywords); }, [keywords]);

  async function copyAll() {
    await navigator.clipboard.writeText(chips.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function removeChip(i: number) {
    const next = chips.filter((_, idx) => idx !== i);
    setChips(next);
    onSave(next);
  }

  function startEdit(i: number) {
    setEditIdx(i);
    setEditVal(chips[i]);
  }

  function commitEdit(i: number) {
    const trimmed = editVal.trim();
    if (!trimmed) { setEditIdx(null); return; }
    const next = chips.map((c, idx) => idx === i ? trimmed : c);
    setChips(next);
    onSave(next);
    setEditIdx(null);
  }

  function addKeyword() {
    const trimmed = newKw.trim();
    if (!trimmed) return;
    const next = [...chips, trimmed];
    setChips(next);
    onSave(next);
    setNewKw("");
  }

  return (
    <div className="rounded-2xl bg-background px-4 py-3 chunky-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          Keywords{" "}
          <span className="text-muted-foreground/60 normal-case font-medium">
            · paste each one separately into KDP
          </span>
        </span>
        <button
          onClick={copyAll}
          className={`inline-flex items-center gap-1 rounded-full px-3 h-7 text-xs font-extrabold transition-all chunky-border ${
            copied ? "bg-accent text-accent-foreground" : "bg-card hover:bg-highlight"
          }`}
        >
          {copied ? <Check className="h-3 w-3" strokeWidth={3} /> : <Copy className="h-3 w-3" strokeWidth={2.5} />}
          {copied ? "Copied!" : "Copy all"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((kw, i) => (
          <div
            key={i}
            className="group flex items-center gap-1 rounded-full bg-highlight px-3 py-1 text-xs font-bold chunky-border"
          >
            {editIdx === i ? (
              <input
                autoFocus
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onBlur={() => commitEdit(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(i);
                  if (e.key === "Escape") setEditIdx(null);
                }}
                className="w-28 bg-transparent focus:outline-none text-xs font-bold"
              />
            ) : (
              <button
                onClick={() => startEdit(i)}
                title="Click to edit"
                className="hover:text-primary transition-colors"
              >
                {kw}
              </button>
            )}
            <div className="flex items-center gap-0.5 ml-1">
              <CopyButton value={kw} small />
              <button
                onClick={() => removeChip(i)}
                title="Remove"
                className="grid h-6 w-6 place-items-center rounded-full hover:bg-destructive/20 hover:text-destructive transition-all"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            </div>
          </div>
        ))}

        {/* Add new keyword */}
        <div className="flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs chunky-border">
          <input
            value={newKw}
            onChange={(e) => setNewKw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            placeholder="Add keyword…"
            className="w-24 bg-transparent focus:outline-none text-xs font-bold placeholder:text-muted-foreground/50"
          />
          <button
            onClick={addKeyword}
            disabled={!newKw.trim()}
            className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
          >
            <Plus className="h-3 w-3" strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, step, children }: { title: string; step: number; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-extrabold chunky-border">
          {step}
        </span>
        <h2 className="font-display text-xl font-black">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-3xl bg-card p-5 chunky-border">
          <div className="h-5 w-40 rounded-full bg-muted mb-4" />
          <div className="space-y-2">
            {[...Array(i === 2 ? 3 : i === 1 ? 4 : 2)].map((_, j) => (
              <div key={j} className="h-14 rounded-2xl bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Inner page (rendered once a book is chosen) ───────────────────────────────

function KDPContent({ book, onChangeBook }: { book: BookOut; onChangeBook: () => void }) {
  const { token } = useAuth();
  const [kdp, setKdp] = useState<KDPOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!book || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.books.kdp(token, book.id);
      setKdp(data);
    } catch {
      setError("Could not load KDP fields. Make sure your book has a completed brief.");
    } finally {
      setLoading(false);
    }
  }, [book, token]);

  const regenerate = useCallback(async () => {
    if (!book || !token) return;
    setRegenerating(true);
    setError(null);
    try {
      const data = await api.books.kdpRegenerate(token, book.id);
      setKdp(data);
    } catch {
      setError("Regeneration failed. Please try again.");
    } finally {
      setRegenerating(false);
    }
  }, [book, token]);

  // Patch a single field (or the keywords array) and update local state
  const saveField = useCallback(async (patch: Partial<Omit<KDPOut, "is_cached">>) => {
    if (!book || !token) return;
    setSaveError(null);
    try {
      const updated = await api.books.kdpUpdate(token, book.id, patch);
      setKdp(updated);
    } catch {
      setSaveError("Could not save changes. Please try again.");
    }
  }, [book, token]);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="h-5 w-5 text-primary" strokeWidth={2.5} />
            <h1 className="font-display text-3xl font-black md:text-4xl">KDP Publishing Setup</h1>
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            Copy-ready fields for{" "}
            <span className="font-bold text-foreground">
              {book.brief?.title ?? book.title}
            </span>
            . Click any field to edit, or paste directly into Kindle Direct Publishing.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={onChangeBook}
            className="inline-flex items-center gap-1.5 rounded-full bg-background px-4 h-9 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
            Change book
          </button>
          {kdp && (
            <span className={`text-xs font-extrabold px-3 py-1 rounded-full chunky-border ${
              kdp.is_cached ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"
            }`}>
              {kdp.is_cached ? "Saved" : "Just generated"}
            </span>
          )}
          <button
            onClick={regenerate}
            disabled={regenerating || loading}
            title="Regenerate with AI"
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-4 h-9 text-sm font-extrabold chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-50"
          >
            {regenerating
              ? <XsSpinner />
              : <RefreshCw className="h-4 w-4" strokeWidth={2.5} />}
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div className="rounded-2xl bg-destructive/10 border-2 border-destructive px-4 py-3 text-sm font-bold text-destructive">
          {error}
        </div>
      )}
      {saveError && (
        <div className="rounded-2xl bg-destructive/10 border-2 border-destructive px-4 py-3 text-sm font-bold text-destructive flex items-center justify-between">
          {saveError}
          <button onClick={() => setSaveError(null)} className="ml-2">
            <X className="h-4 w-4" strokeWidth={3} />
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <>
          <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <SmSpinner />
            Generating your KDP fields with AI — this takes about 5 seconds…
          </div>
          <Skeleton />
        </>
      ) : kdp ? (
        <>
          {/* Section 1 — Book Details */}
          <Section title="Book Details" step={1}>
            <FieldRow label="Book Title" value={kdp.title} hint="Exact title field in KDP"
              onSave={(v) => saveField({ title: v })} />
            <FieldRow label="Subtitle" value={kdp.subtitle} hint="Optional but boosts discoverability"
              onSave={(v) => saveField({ subtitle: v })} />
            <FieldRow label="Author" value={kdp.author} hint="Primary author name"
              onSave={(v) => saveField({ author: v })} />
            <FieldRow
              label="Book Description"
              value={kdp.description_html}
              hint="Paste as HTML in KDP's description field"
              multiline
              onSave={(v) => saveField({ description_html: v })}
            />
          </Section>

          {/* Section 2 — Categories & Keywords */}
          <Section title="Categories & Keywords" step={2}>
            <FieldRow label="Primary Category" value={kdp.primary_category} hint="Best-fit Amazon category path"
              onSave={(v) => saveField({ primary_category: v })} />
            <FieldRow label="Secondary Category" value={kdp.secondary_category} hint="Complementary category path"
              onSave={(v) => saveField({ secondary_category: v })} />
            <KeywordsRow keywords={kdp.keywords} onSave={(kws) => saveField({ keywords: kws })} />
          </Section>

          {/* Section 3 — Target Audience */}
          <Section title="Target Audience" step={3}>
            <FieldRow
              label="Reading Age"
              value={`${kdp.reading_age_min} – ${kdp.reading_age_max}`}
              hint="Age range in KDP audience settings"
              onSave={(v) => {
                const [min, max] = v.split(/\s*[–-]\s*/).map(Number);
                if (!isNaN(min) && !isNaN(max)) saveField({ reading_age_min: min, reading_age_max: max });
              }}
            />
            <FieldRow label="Grade Range" value={kdp.grade_range} hint="US grade equivalent"
              onSave={(v) => saveField({ grade_range: v })} />
            <FieldRow label="Language" value={kdp.language}
              onSave={(v) => saveField({ language: v })} />
          </Section>

          {/* Section 4 — Print Settings */}
          <Section title="Print Settings" step={4}>
            <FieldRow label="Trim Size" value={kdp.trim_size} hint="Paperback interior dimensions"
              onSave={(v) => saveField({ trim_size: v })} />
            <FieldRow label="Interior Type" value={kdp.interior_type} hint="Select 'Full Color' in KDP print options"
              onSave={(v) => saveField({ interior_type: v })} />
            <FieldRow label="Paper Color" value={kdp.paper_color}
              onSave={(v) => saveField({ paper_color: v })} />
            <FieldRow
              label="Page Count"
              value={String(kdp.estimated_page_count)}
              hint="Estimated — KDP will calculate the final count from your uploaded file"
              onSave={(v) => { const n = parseInt(v); if (!isNaN(n)) saveField({ estimated_page_count: n }); }}
            />
          </Section>

          {/* Section 5 — Rights & Pricing */}
          <Section title="Rights & Pricing" step={5}>
            <FieldRow label="Publishing Rights" value={kdp.publishing_rights} hint="Select this option in KDP"
              onSave={(v) => saveField({ publishing_rights: v })} />
            <FieldRow label="Territories" value={kdp.territories}
              onSave={(v) => saveField({ territories: v })} />
            <FieldRow label="Royalty Plan" value={kdp.royalty_plan} hint="Recommended royalty structure"
              onSave={(v) => saveField({ royalty_plan: v })} />
            <FieldRow
              label="Suggested List Price"
              value={kdp.suggested_price_usd}
              hint="Competitive price for your page count — adjust based on your goals"
              onSave={(v) => saveField({ suggested_price_usd: v })}
            />
          </Section>

          {/* CTA */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href="https://kdp.amazon.com/en_US/title-setup/paperback/new/details"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform"
            >
              <BookOpen className="h-5 w-5" strokeWidth={2.5} />
              Open KDP Dashboard
              <ExternalLink className="h-4 w-4 opacity-70" strokeWidth={2.5} />
            </a>
            <p className="text-xs text-muted-foreground font-medium max-w-xs">
              Opens Amazon KDP in a new tab. Start a new paperback title and paste these fields.
            </p>
          </div>
        </>
      ) : null}
    </main>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KDPPage() {
  const [book, setBook] = useState<BookOut | null>(null);

  if (!book) {
    return (
      <BookPicker
        heading="KDP Publishing Setup"
        subheading="Choose which book to generate publishing fields for."
        onSelect={setBook}
      />
    );
  }

  return <KDPContent book={book} onChangeBook={() => setBook(null)} />;
}
