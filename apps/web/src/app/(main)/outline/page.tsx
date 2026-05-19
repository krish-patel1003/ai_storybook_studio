"use client";

import { useState } from "react";
import Link from "next/link";
import {
  GripVertical,
  RefreshCw,
  Pencil,
  Plus,
  Lock,
  Unlock,
  Sparkles,
  BookOpen,
  Check,
  X,
  Loader2,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, type PageOut } from "@/lib/api";
import { useRelativeTime } from "@/lib/use-relative-time";
import { toast } from "sonner";

// ── Inline beat editor ────────────────────────────────────────────────────────

function BeatEditor({
  page,
  onSave,
  onCancel,
  saving,
}: {
  page: PageOut;
  onSave: (beat: string, settingNote: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [beat, setBeat] = useState(page.beat);
  const [setting, setSetting] = useState(page.setting_note);

  return (
    <div className="mt-3 space-y-2">
      <textarea
        rows={2}
        value={beat}
        onChange={(e) => setBeat(e.target.value)}
        className="w-full resize-none rounded-xl bg-background px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30"
        placeholder="What happens on this page?"
      />
      <input
        value={setting}
        onChange={(e) => setSetting(e.target.value)}
        className="w-full rounded-xl bg-background px-3 py-2 text-sm chunky-border outline-none focus:ring-2 focus:ring-primary/30"
        placeholder="Setting note…"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSave(beat, setting)}
          disabled={saving}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground chunky-border"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" strokeWidth={3} />}
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 rounded-xl bg-background px-3 py-1.5 text-xs font-extrabold chunky-border"
        >
          <X className="h-3 w-3" strokeWidth={3} /> Cancel
        </button>
      </div>
    </div>
  );
}

// ── Add page inline form ──────────────────────────────────────────────────────

function AddPageForm({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (beat: string, narrativeRole: string, settingNote: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [beat, setBeat] = useState("");
  const [role, setRole] = useState("");
  const [setting, setSetting] = useState("");

  return (
    <li className="rounded-2xl bg-card p-4 chunky-border chunky-shadow-sm">
      <p className="mb-3 text-sm font-extrabold text-muted-foreground">New page</p>
      <div className="space-y-2">
        <textarea
          rows={2}
          value={beat}
          onChange={(e) => setBeat(e.target.value)}
          className="w-full resize-none rounded-xl bg-background px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="What happens on this page? (required)"
          autoFocus
        />
        <div className="flex gap-2">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="flex-1 rounded-xl bg-background px-3 py-2 text-sm chunky-border outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Narrative role (e.g. Rising action)"
          />
          <input
            value={setting}
            onChange={(e) => setSetting(e.target.value)}
            className="flex-1 rounded-xl bg-background px-3 py-2 text-sm chunky-border outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Setting note"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSave(beat, role, setting)}
            disabled={saving || beat.trim().length < 5}
            className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground chunky-border disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" strokeWidth={3} />}
            Add page
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded-xl bg-background px-3 py-1.5 text-xs font-extrabold chunky-border"
          >
            <X className="h-3 w-3" strokeWidth={3} /> Cancel
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Add character modal ───────────────────────────────────────────────────────

function AddCharacterModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (data: {
    name: string;
    is_protagonist: boolean;
    role_description: string;
    personality: string;
    visual_anchors: string[];
    illustration_prompt: string;
  }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [isProtagonist, setIsProtagonist] = useState(false);
  const [roleDesc, setRoleDesc] = useState("");
  const [personality, setPersonality] = useState("");
  const [anchorsRaw, setAnchorsRaw] = useState("");
  const [illustrationPrompt, setIllustrationPrompt] = useState("");

  function submit() {
    const anchors = anchorsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({
      name: name.trim(),
      is_protagonist: isProtagonist,
      role_description: roleDesc,
      personality,
      visual_anchors: anchors,
      illustration_prompt: illustrationPrompt,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-black">New character</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border hover:bg-secondary">
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-extrabold text-muted-foreground">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl bg-background px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Character name"
              autoFocus
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={isProtagonist}
              onChange={(e) => setIsProtagonist(e.target.checked)}
              className="h-4 w-4 rounded accent-primary"
            />
            Protagonist
          </label>

          <div>
            <label className="mb-1 block text-xs font-extrabold text-muted-foreground">Role in story</label>
            <input
              value={roleDesc}
              onChange={(e) => setRoleDesc(e.target.value)}
              className="w-full rounded-xl bg-background px-3 py-2 text-sm chunky-border outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. The brave young explorer who seeks the lost treasure"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-extrabold text-muted-foreground">Personality</label>
            <input
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              className="w-full rounded-xl bg-background px-3 py-2 text-sm chunky-border outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Curious, brave, sometimes too hasty"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-extrabold text-muted-foreground">
              Visual anchors <span className="font-normal text-muted-foreground/70">(comma-separated)</span>
            </label>
            <input
              value={anchorsRaw}
              onChange={(e) => setAnchorsRaw(e.target.value)}
              className="w-full rounded-xl bg-background px-3 py-2 text-sm chunky-border outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="red curly hair, green eyes, freckles, blue backpack"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-extrabold text-muted-foreground">Illustration prompt hint</label>
            <textarea
              rows={2}
              value={illustrationPrompt}
              onChange={(e) => setIllustrationPrompt(e.target.value)}
              className="w-full resize-none rounded-xl bg-background px-3 py-2 text-sm chunky-border outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="How the illustrator should depict this character consistently"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={submit}
            disabled={saving || name.trim().length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" strokeWidth={2.5} />}
            Add character
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-background px-4 py-2.5 text-sm font-extrabold chunky-border"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── No-book placeholder ───────────────────────────────────────────────────────

function NoBook() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-32 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-3xl bg-muted chunky-border">
        <BookOpen className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="font-display text-2xl font-black">No book loaded</h2>
        <p className="mt-1 text-muted-foreground">Create a new book or open one from your library.</p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/create"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2.5} /> New book
        </Link>
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 rounded-full bg-background px-5 py-2.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
        >
          Open library
        </Link>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OutlinePage() {
  const { token } = useAuth();
  const { book, updateBook } = useBook();
  const lastSaved = useRelativeTime(book?.updated_at);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [addingPage, setAddingPage] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [showCharModal, setShowCharModal] = useState(false);
  const [savingChar, setSavingChar] = useState(false);

  if (!book) return <main className="mx-auto max-w-7xl px-4 py-10"><NoBook /></main>;

  const contentPages = book.pages.filter((p) => !p.is_cover).sort((a, b) => a.order - b.order);

  async function saveBeat(page: PageOut, beat: string, settingNote: string) {
    if (!token) return;
    setSavingId(page.id);
    try {
      const updated = await api.books.updatePage(token, book!.id, page.id, {
        beat,
        setting_note: settingNote,
      });
      updateBook({ pages: updated.pages, characters: updated.characters });
      setEditingId(null);
      toast.success("Beat saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleLock(page: PageOut) {
    if (!token) return;
    setTogglingId(page.id);
    try {
      const updated = await api.books.updatePage(token, book!.id, page.id, {
        is_locked: !page.is_locked,
      });
      updateBook({ pages: updated.pages });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    } finally {
      setTogglingId(null);
    }
  }

  async function regeneratePage(page: PageOut) {
    if (!token) return;
    setRegeneratingId(page.id);
    try {
      const updated = await api.books.regeneratePage(token, book!.id, page.id);
      updateBook({ pages: updated.pages });
      toast.success(`Page ${page.order} regenerated`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to regenerate");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleAddPage(beat: string, narrativeRole: string, settingNote: string) {
    if (!token) return;
    setSavingPage(true);
    try {
      const updated = await api.books.addPage(token, book!.id, {
        beat,
        narrative_role: narrativeRole,
        setting_note: settingNote,
      });
      updateBook({ pages: updated.pages, page_count: updated.page_count });
      setAddingPage(false);
      toast.success("Page added");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add page");
    } finally {
      setSavingPage(false);
    }
  }

  async function handleAddCharacter(data: {
    name: string;
    is_protagonist: boolean;
    role_description: string;
    personality: string;
    visual_anchors: string[];
    illustration_prompt: string;
  }) {
    if (!token) return;
    setSavingChar(true);
    try {
      const updated = await api.books.addCharacter(token, book!.id, data);
      updateBook({ characters: updated.characters });
      setShowCharModal(false);
      toast.success(`${data.name} added to cast`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add character");
    } finally {
      setSavingChar(false);
    }
  }

  const lockedCount = contentPages.filter((p) => p.is_locked).length;

  return (
    <>
      {showCharModal && (
        <AddCharacterModal
          onSave={handleAddCharacter}
          onClose={() => setShowCharModal(false)}
          saving={savingChar}
        />
      )}

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-10 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-black md:text-5xl">Story outline</h1>
              <p className="mt-1 text-muted-foreground">
                {contentPages.length} pages · {lockedCount} locked.
                {book.brief && (
                  <span className="ml-1 font-semibold text-foreground">
                    {book.brief.narrative_structure}
                  </span>
                )}
              </p>
              {lastSaved && (
                <p className="mt-1 text-xs font-bold text-muted-foreground">Saved {lastSaved}</p>
              )}
            </div>
            <Link
              href="/editor"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
            >
              <Sparkles className="h-4 w-4" strokeWidth={3} /> Illustrate it
            </Link>
          </div>

          {/* Brief summary */}
          {book.brief && (
            <div className="mt-4 rounded-2xl bg-card p-4 chunky-border chunky-shadow-sm">
              <p className="font-display text-lg font-black">{book.brief.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{book.brief.logline}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {book.brief.arc.map((stage) => (
                  <span
                    key={stage.name}
                    className="rounded-full bg-highlight px-2.5 py-1 text-xs font-bold chunky-border"
                  >
                    {stage.name} · {stage.page_span}p
                  </span>
                ))}
              </div>
            </div>
          )}

          <ol className="mt-6 space-y-3">
            {contentPages.map((page) => (
              <li
                key={page.id}
                className={`group rounded-2xl bg-card p-4 chunky-border chunky-shadow-sm transition-all ${
                  page.is_locked ? "border-accent/60" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <button className="mt-0.5 cursor-grab text-muted-foreground hover:text-foreground">
                    <GripVertical className="h-5 w-5" />
                  </button>

                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-highlight font-display font-black chunky-border">
                    {page.order}
                  </span>

                  <div className="flex-1 min-w-0">
                    {editingId === page.id ? (
                      <BeatEditor
                        page={page}
                        onSave={(beat, setting) => saveBeat(page, beat, setting)}
                        onCancel={() => setEditingId(null)}
                        saving={savingId === page.id}
                      />
                    ) : (
                      <>
                        <p className="font-semibold leading-snug">{page.beat}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="font-bold text-primary/70">{page.narrative_role}</span>
                          {page.setting_note && (
                            <>
                              <span>·</span>
                              <span>{page.setting_note}</span>
                            </>
                          )}
                        </div>
                        {page.text && (
                          <p className="mt-2 text-sm text-muted-foreground line-clamp-2 italic">
                            &ldquo;{page.text}&rdquo;
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {editingId !== page.id && (
                    <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => toggleLock(page)}
                        disabled={togglingId === page.id}
                        title={page.is_locked ? "Unlock page" : "Lock page"}
                        className={`grid h-9 w-9 place-items-center rounded-full chunky-border ${
                          page.is_locked ? "bg-accent" : "bg-background hover:bg-accent/30"
                        }`}
                      >
                        {togglingId === page.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : page.is_locked ? (
                          <Lock className="h-4 w-4" strokeWidth={2.5} />
                        ) : (
                          <Unlock className="h-4 w-4" strokeWidth={2.5} />
                        )}
                      </button>

                      <button
                        onClick={() => setEditingId(page.id)}
                        className="grid h-9 w-9 place-items-center rounded-full bg-background hover:bg-secondary chunky-border"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={2.5} />
                      </button>

                      <button
                        onClick={() => regeneratePage(page)}
                        disabled={!!regeneratingId}
                        className="grid h-9 w-9 place-items-center rounded-full bg-background hover:bg-accent chunky-border disabled:opacity-50"
                      >
                        {regeneratingId === page.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" strokeWidth={2.5} />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}

            {addingPage ? (
              <AddPageForm
                onSave={handleAddPage}
                onCancel={() => setAddingPage(false)}
                saving={savingPage}
              />
            ) : (
              <li>
                <button
                  onClick={() => setAddingPage(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-[2.5px] border-dashed border-foreground/40 bg-transparent px-4 py-4 text-sm font-extrabold text-foreground/60 hover:bg-card hover:text-foreground"
                >
                  <Plus className="h-4 w-4" strokeWidth={3} /> Add page
                </button>
              </li>
            )}
          </ol>
        </section>

        {/* Cast sidebar */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm">
            <h2 className="font-display text-2xl font-black">Cast</h2>
            <p className="text-sm text-muted-foreground">Locked traits keep them consistent.</p>
            <div className="mt-4 space-y-3">
              {book.characters.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No characters yet</p>
              ) : (
                book.characters.map((c) => (
                  <div key={c.id} className="rounded-2xl bg-background p-3 chunky-border">
                    <div className="flex items-center gap-3">
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/10 chunky-border font-display text-2xl font-black text-primary">
                        {c.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-lg font-black truncate">{c.name}</div>
                        <div className="flex items-center gap-1 text-xs font-bold text-accent-foreground">
                          <Lock className="h-3 w-3" /> {c.visual_anchors.length} visual anchors
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.visual_anchors.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}

              <button
                onClick={() => setShowCharModal(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-[2.5px] border-dashed border-foreground/40 px-3 py-3 text-sm font-extrabold text-foreground/60 hover:bg-background hover:text-foreground"
              >
                <Plus className="h-4 w-4" strokeWidth={3} /> Add character
              </button>
            </div>
          </div>
        </aside>
      </main>
    </>
  );
}
