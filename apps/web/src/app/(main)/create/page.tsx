"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Sparkles,
  Shield,
  Check,
  Loader2,
  BookOpen,
  RefreshCw,
  Cpu,
  Cloud,
  Wand2,
  ImageIcon,
  Mic,
  Users,
  Pencil,
  Plus,
  X,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, type BookOut, type BriefOut, type ProviderInfo } from "@/lib/api";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────

const EXAMPLES = [
  "A brave little fox who learns to share",
  "Two best-friend robots who lose their colors",
  "A shy dragon who runs a tiny tea shop",
];

const STYLES = [
  { id: "watercolor", label: "Watercolor", img: "/assets/cover.jpg" },
  { id: "crayon",     label: "Crayon",     img: "/assets/page1.jpg" },
  { id: "flat",       label: "Flat",       img: "/assets/page2.jpg" },
  { id: "papercut",   label: "Papercut",   img: "/assets/page3.jpg" },
];

const TONES_PRESET = [
  "Funny", "Silly", "Calm", "Cozy", "Heartwarming",
  "Adventurous", "Epic", "Whimsical", "Magical",
  "Mysterious", "Spooky", "Educational",
  "Fantasy", "Fairy Tale", "Sci-Fi", "Nature",
  "Friendship", "Family", "Courage", "Kindness",
  "Animals", "Space", "Ocean", "Bedtime",
];

const PAGE_COUNT_OPTIONS = [6, 8, 10, 12, 15, 20, 24, 30, 40];

const PROMPT_MAX_WORDS = 80;

function wordCount(text: string) {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

// ── Generation stage data ─────────────────────────────────────────────────────

const GENERATION_STAGES: { label: string; hints: string[] }[] = [
  {
    label: "Enhancing your idea…",
    hints: ["Sprinkling story magic ✨", "Thinking deeply about your world…", "Mapping out the adventure…"],
  },
  {
    label: "Building characters…",
    hints: ["Designing your heroes & villains…", "Giving everyone a personality…", "Deciding who needs a funny hat 🎩"],
  },
  {
    label: "Writing story beats…",
    hints: ["Planning the twists and turns…", "Making sure the ending lands…", "Adding a few surprises 🎉"],
  },
  {
    label: "Writing pages…",
    hints: ["Choosing every word carefully…", "Making it age-appropriate and fun…", "Finding the perfect sentences…"],
  },
  {
    label: "Polishing the prose…",
    hints: ["Smoothing out the rough edges…", "Reading it aloud (virtually)…", "Making it sound just right 🎶"],
  },
  {
    label: "Reviewing and improving…",
    hints: ["One final read-through…", "Adding the finishing touches…", "Almost there — nearly ready! 🚀"],
  },
];

// ── Elapsed timer hook ────────────────────────────────────────────────────────

function useElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── Standard generating overlay ───────────────────────────────────────────────

function GeneratingOverlay() {
  const [stageIdx, setStageIdx] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);
  const [progress, setProgress] = useState(4);
  const timer = useElapsedTimer();

  useEffect(() => {
    const stageMs = [8000, 15000, 20000, 60000, 20000, 18000];
    let total = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    stageMs.forEach((ms, i) => {
      total += ms;
      timers.push(setTimeout(() => {
        if (i + 1 < GENERATION_STAGES.length) { setStageIdx(i + 1); setHintIdx(0); }
      }, total - ms + 1000));
    });
    const tick = setInterval(() => setProgress((p) => Math.min(p + 0.5, 94)), 600);
    const hintTick = setInterval(() => setHintIdx((h) => h + 1), 3000);
    return () => { timers.forEach(clearTimeout); clearInterval(tick); clearInterval(hintTick); };
  }, []);

  const stage = GENERATION_STAGES[stageIdx];
  const hint = stage.hints[hintIdx % stage.hints.length];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur">
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <div className="relative grid h-24 w-24 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
          <BookOpen className="h-10 w-10 text-primary-foreground" strokeWidth={2} />
          <span className="absolute -right-2 -top-2 h-5 w-5 animate-spin rounded-full border-[3px] border-foreground border-t-transparent" />
        </div>
        <div>
          <h2 className="font-display text-3xl font-black">Writing your story…</h2>
          <p className="mt-1 text-muted-foreground">This takes about a minute. Grab a snack 🍎</p>
        </div>
        <div className="w-80">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
            <AnimatePresence mode="wait">
              <motion.span key={stageIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                {stage.label}
              </motion.span>
            </AnimatePresence>
            <span className="font-mono tabular-nums">{timer}</span>
          </div>
          <div className="mb-3 h-3 overflow-hidden rounded-full bg-muted chunky-border">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
          </div>
          <AnimatePresence mode="wait">
            <motion.p key={hint} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-sm font-bold text-muted-foreground">
              {hint}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="mt-2 flex gap-2">
          {GENERATION_STAGES.map((_, i) => (
            <div key={i} className={`h-2 w-2 rounded-full transition-all ${i <= stageIdx ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── One-click overlay ─────────────────────────────────────────────────────────

const ONE_CLICK_HINTS: Record<string, string[]> = {
  writing:      ["Crafting your story arc…", "Picking the perfect words…", "Making every page count…", "Weaving plot twists 🌀"],
  characters:   ["Sketching character traits…", "Deciding who's the hero 🦊", "Giving everyone backstories…"],
  illustrating: ["Painting the scenes…", "Adding colour and detail 🎨", "Making each page beautiful…", "Bringing characters to life…"],
  narrating:    ["Finding the perfect voice 🎙️", "Adding emotion to each line…", "Recording the narration…"],
};

type OneClickStage = "writing" | "characters" | "illustrating" | "narrating" | "done";

const ONE_CLICK_STAGES: { id: OneClickStage; icon: React.ReactNode; label: string }[] = [
  { id: "writing",      icon: <Sparkles className="h-4 w-4" />,  label: "Writing"      },
  { id: "characters",   icon: <Users className="h-4 w-4" />,     label: "Characters"   },
  { id: "illustrating", icon: <ImageIcon className="h-4 w-4" />, label: "Illustrating" },
  { id: "narrating",    icon: <Mic className="h-4 w-4" />,       label: "Narrating"    },
];

function OneClickOverlay({ stage, progress, book, onView }: {
  stage: OneClickStage;
  progress: { done: number; total: number };
  book: BookOut | null;
  onView: () => void;
}) {
  const [hintIdx, setHintIdx] = useState(0);
  const timer = useElapsedTimer();

  useEffect(() => { setHintIdx(0); }, [stage]);
  useEffect(() => {
    if (stage === "done") return;
    const t = setInterval(() => setHintIdx((h) => h + 1), 3000);
    return () => clearInterval(t);
  }, [stage]);

  const stageIdx = ONE_CLICK_STAGES.findIndex((s) => s.id === stage);
  const isDone = stage === "done";

  const overallPct = isDone ? 100
    : stageIdx === 0 ? 10
    : stageIdx === 1 ? 25
    : stageIdx === 2 ? 40 + (progress.total > 0 ? (progress.done / progress.total) * 30 : 0)
    : 70 + (progress.total > 0 ? (progress.done / progress.total) * 27 : 0);

  const stageLabel =
    stage === "writing"      ? "Writing your story…"
    : stage === "characters" ? "Designing character sheets…"
    : stage === "illustrating" ? `Illustrating pages…${progress.total > 0 ? ` (${progress.done} / ${progress.total})` : ""}`
    : stage === "narrating"  ? `Adding narration…${progress.total > 0 ? ` (${progress.done} / ${progress.total})` : ""}`
    : "Your book is ready!";

  const hints = ONE_CLICK_HINTS[stage] ?? [];
  const hint = hints[hintIdx % hints.length];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur px-6">
      <AnimatePresence mode="wait">
        {isDone ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-6 text-center">
            <div className="grid h-28 w-28 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
              <BookOpen className="h-12 w-12 text-primary-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="font-display text-4xl font-black">Your book is ready!</h2>
              {book && <p className="mt-2 text-lg font-bold text-muted-foreground">{book.brief?.title ?? book.title}</p>}
              <p className="mt-1 text-sm text-muted-foreground">Completed in {timer} ✦</p>
            </div>
            <button onClick={onView} className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform">
              <BookOpen className="h-5 w-5" strokeWidth={2.5} /> Read your book
            </button>
          </motion.div>
        ) : (
          <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
            <div className="relative grid h-24 w-24 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
              <Wand2 className="h-10 w-10 text-primary-foreground" strokeWidth={2} />
              <span className="absolute -right-2 -top-2 h-5 w-5 animate-spin rounded-full border-[3px] border-foreground border-t-transparent" />
            </div>
            <div>
              <h2 className="font-display text-3xl font-black">Making your book…</h2>
              <AnimatePresence mode="wait">
                <motion.p key={stageLabel} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="mt-1 text-sm font-extrabold text-foreground/80">
                  {stageLabel}
                </motion.p>
              </AnimatePresence>
              <AnimatePresence mode="wait">
                <motion.p key={hint} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-1 text-xs text-muted-foreground">
                  {hint}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="w-full">
              <div className="mb-1.5 flex justify-between text-xs font-bold text-muted-foreground">
                <span>{Math.round(overallPct)}% complete</span>
                <span className="font-mono tabular-nums">{timer}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted chunky-border">
                <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${overallPct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              {ONE_CLICK_STAGES.map((s, i) => {
                const done = i < stageIdx;
                const active = i === stageIdx;
                return (
                  <div key={s.id} className="flex flex-col items-center gap-1.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full chunky-border transition-all ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary text-primary-foreground scale-110 chunky-shadow" : "bg-muted text-muted-foreground"}`}>
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : s.icon}
                    </div>
                    <span className={`text-xs font-bold ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Sit back and relax — this takes a few minutes ✨</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Brief field row ───────────────────────────────────────────────────────────

function BriefFieldRow({ label, value, multiline, onEdit, onRegenerate, regenerating }: {
  label: string; value: string; multiline?: boolean;
  onEdit: (v: string) => void; onRegenerate: () => void; regenerating: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  return (
    <div className="rounded-2xl bg-background p-4 chunky-border">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {!editing && (
            <button onClick={() => { setDraft(value); setEditing(true); }} className="rounded-full bg-card p-1.5 chunky-border hover:-translate-y-0.5 transition-transform" title="Edit">
              <Pencil className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
          <button onClick={onRegenerate} disabled={regenerating} className="rounded-full bg-card p-1.5 chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-50" title="Regenerate">
            {regenerating ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} /> : <RefreshCw className="h-3 w-3" strokeWidth={2.5} />}
          </button>
        </div>
      </div>
      {editing ? (
        <div>
          {multiline
            ? <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full resize-none rounded-xl bg-card px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30" />
            : <input value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full rounded-xl bg-card px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30" />
          }
          <div className="mt-2 flex gap-2">
            <button onClick={() => { onEdit(draft); setEditing(false); }} className="rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground chunky-border">Save</button>
            <button onClick={() => setEditing(false)} className="rounded-full bg-background px-3 py-1 text-xs font-extrabold chunky-border">Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text-sm font-semibold leading-snug">{value}</p>
      )}
    </div>
  );
}

// ── Options panel (shared between sidebar + mobile accordion) ─────────────────

function OptionsPanel({
  age, setAge,
  tone, setTone,
  customTones, setCustomTones,
  customToneInput, setCustomToneInput,
  style, setStyle,
  pageCount, setPageCount,
  isCustomPageCount, setIsCustomPageCount,
  customPageCountInput, setCustomPageCountInput,
  safety, setSafety,
  modelProvider, setModelProvider,
  modelName, setModelName,
  providers, modelsLoading,
  prompt, onOneClick,
}: {
  age: string; setAge: (v: string) => void;
  tone: string[]; setTone: (v: string[]) => void;
  customTones: string[]; setCustomTones: (v: string[]) => void;
  customToneInput: string; setCustomToneInput: (v: string) => void;
  style: string; setStyle: (v: string) => void;
  pageCount: number; setPageCount: (v: number) => void;
  isCustomPageCount: boolean; setIsCustomPageCount: (v: boolean) => void;
  customPageCountInput: string; setCustomPageCountInput: (v: string) => void;
  safety: boolean; setSafety: (v: boolean) => void;
  modelProvider: string; setModelProvider: (v: string) => void;
  modelName: string; setModelName: (v: string) => void;
  providers: ProviderInfo[]; modelsLoading: boolean;
  prompt: string; onOneClick: () => void;
}) {
  return (
    <div className="space-y-6">

      {/* Age range */}
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Reading level</p>
        <div className="grid grid-cols-3 gap-2">
          {["3-5", "6-8", "9-11"].map((a) => (
            <button key={a} onClick={() => setAge(a)} className={`rounded-xl px-3 py-2.5 text-sm font-extrabold chunky-border transition-all hover:-translate-y-0.5 ${age === a ? "bg-primary text-primary-foreground chunky-shadow-sm" : "bg-background"}`}>
              Ages {a}
            </button>
          ))}
        </div>
      </div>

      {/* Tone & genre */}
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Tone &amp; Genre</p>
        <div className="flex flex-wrap gap-1.5">
          {[...TONES_PRESET, ...customTones].map((t) => {
            const on = tone.includes(t);
            const isCustom = customTones.includes(t);
            return (
              <button
                key={t}
                onClick={() => setTone(on ? tone.filter((x) => x !== t) : [...tone, t])}
                className={`group relative rounded-full px-3 py-1.5 text-xs font-bold chunky-border transition-transform hover:-translate-y-0.5 ${on ? "bg-accent text-accent-foreground chunky-shadow-sm" : "bg-background"}`}
              >
                {t}
                {isCustom && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); setCustomTones(customTones.filter((c) => c !== t)); setTone(tone.filter((x) => x !== t)); }}
                    className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2 w-2" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
          <div className="flex items-center gap-1">
            <input
              value={customToneInput}
              onChange={(e) => setCustomToneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customToneInput.trim()) {
                  const val = customToneInput.trim();
                  if (!customTones.includes(val) && !TONES_PRESET.includes(val)) { setCustomTones([...customTones, val]); setTone([...tone, val]); }
                  setCustomToneInput("");
                }
              }}
              placeholder="Custom…"
              className="h-[30px] w-24 rounded-full bg-background px-2.5 text-xs font-bold chunky-border outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
            />
            <button
              onClick={() => {
                const val = customToneInput.trim();
                if (!val) return;
                if (!customTones.includes(val) && !TONES_PRESET.includes(val)) { setCustomTones([...customTones, val]); setTone([...tone, val]); }
                setCustomToneInput("");
              }}
              disabled={!customToneInput.trim()}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground chunky-border disabled:opacity-40"
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>
        </div>
        {tone.length > 0 && <p className="mt-1 text-xs text-muted-foreground font-semibold">{tone.length} selected</p>}
      </div>

      {/* Art style */}
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Art style</p>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map((s) => {
            const on = style === s.id;
            return (
              <button key={s.id} onClick={() => setStyle(s.id)} className={`overflow-hidden rounded-xl bg-background text-left chunky-border transition-all hover:-translate-y-0.5 ${on ? "ring-[3px] ring-primary/50 -translate-y-0.5 chunky-shadow-sm" : ""}`}>
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  <img src={s.img} alt={s.label} loading="lazy" className="h-full w-full object-cover" />
                </div>
                <div className={`flex items-center justify-between border-t-[2px] border-foreground px-2.5 py-1.5 text-xs font-extrabold ${on ? "bg-primary text-primary-foreground" : ""}`}>
                  {s.label}
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Page count */}
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Page count</p>
        <div className="flex flex-wrap gap-1.5">
          {PAGE_COUNT_OPTIONS.map((n) => (
            <button key={n} onClick={() => { setPageCount(n); setIsCustomPageCount(false); }} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold chunky-border transition-transform hover:-translate-y-0.5 ${!isCustomPageCount && pageCount === n ? "bg-primary text-primary-foreground chunky-shadow-sm" : "bg-background"}`}>
              {n}
            </button>
          ))}
          <button onClick={() => setIsCustomPageCount(true)} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold chunky-border transition-transform hover:-translate-y-0.5 ${isCustomPageCount ? "bg-primary text-primary-foreground chunky-shadow-sm" : "bg-background"}`}>
            Custom
          </button>
        </div>
        {isCustomPageCount && (
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min={4} max={100} value={customPageCountInput} onChange={(e) => { setCustomPageCountInput(e.target.value); const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 4 && n <= 100) setPageCount(n); }} placeholder="e.g. 18" className="w-24 rounded-xl bg-background px-3 py-1.5 text-sm font-extrabold chunky-border outline-none focus:ring-2 focus:ring-primary/30" />
            <span className="text-xs font-bold text-muted-foreground">pages (4–100)</span>
          </div>
        )}
      </div>

      {/* Safety */}
      <button onClick={() => setSafety(!safety)} className="flex w-full items-center justify-between rounded-2xl bg-background p-3.5 chunky-border">
        <div className="flex items-center gap-2.5">
          <Shield className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          <div className="text-left">
            <div className="text-sm font-extrabold">Safety filters</div>
            <div className="text-xs text-muted-foreground">Block scary themes &amp; unkind language</div>
          </div>
        </div>
        <span className={`relative h-6 w-11 rounded-full chunky-border shrink-0 ${safety ? "bg-accent" : "bg-muted"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-all ${safety ? "left-6" : "left-0.5"}`} />
        </span>
      </button>

      {/* AI model */}
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">AI model</p>
        {modelsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Detecting models…
          </div>
        ) : (
          <div className="space-y-2">
            {(providers.length > 0 ? providers : [{
              id: "gemini", name: "Google Gemini", description: "Cloud-hosted · High quality", available: true,
              models: [
                { id: "gemini-3.5-flash", name: "Gemini Flash", description: "Fast & efficient", size: "cloud" },
                { id: "gemini-1.5-pro",   name: "Gemini Pro",   description: "Highest quality",  size: "cloud" },
              ],
            }]).map((provider) => (
              <div key={provider.id}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">{provider.name}</span>
                  {!provider.available && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">not running</span>}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {provider.models.map((m) => {
                    const active = modelProvider === provider.id && modelName === m.id;
                    return (
                      <button key={m.id} disabled={!provider.available} onClick={() => { setModelProvider(provider.id); setModelName(m.id); }} className={`flex items-start gap-2.5 rounded-xl p-2.5 text-left chunky-border transition-all disabled:opacity-40 ${active ? "bg-primary text-primary-foreground chunky-shadow-sm" : "bg-background hover:bg-highlight"}`}>
                        <div className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2 ${active ? "border-primary-foreground bg-primary-foreground" : "border-foreground/40"}`}>
                          {active && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </div>
                        <div>
                          <div className="text-xs font-extrabold leading-tight">{m.name}</div>
                          <div className={`text-[11px] mt-0.5 ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {m.description}
                            {m.size && m.size !== "cloud" && <span className="ml-1 rounded-full bg-foreground/10 px-1.5 py-0.5">{m.size}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* One-click CTA */}
      <div className="rounded-2xl bg-primary/5 p-4 chunky-border">
        <div className="flex items-start gap-3 mb-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary chunky-border">
            <Wand2 className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-extrabold">Make it for me</p>
            <p className="text-xs text-muted-foreground mt-0.5">Writes, illustrates &amp; narrates your entire book automatically.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[
            { icon: <Sparkles className="h-3 w-3" />, label: "Story written" },
            { icon: <ImageIcon className="h-3 w-3" />, label: "Illustrated" },
            { icon: <Mic className="h-3 w-3" />, label: "Narrated" },
          ].map(({ icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-bold chunky-border">{icon} {label}</span>
          ))}
        </div>
        <button
          onClick={onOneClick}
          disabled={prompt.trim().length < 10}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0"
        >
          <Wand2 className="h-4 w-4" strokeWidth={2.5} />
          Fully automatic
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FlowState = "input" | "enhancing" | "brief";

export default function CreatePage() {
  const router = useRouter();
  const { token } = useAuth();
  const { setBook } = useBook();

  // Prompt + options
  const [prompt, setPrompt] = useState("");
  const [age, setAge] = useState("3-5");
  const [tone, setTone] = useState<string[]>(["Funny"]);
  const [customTones, setCustomTones] = useState<string[]>([]);
  const [customToneInput, setCustomToneInput] = useState("");
  const [safety, setSafety] = useState(true);
  const [pageCount, setPageCount] = useState(10);
  const [isCustomPageCount, setIsCustomPageCount] = useState(false);
  const [customPageCountInput, setCustomPageCountInput] = useState("");
  const [style, setStyle] = useState("watercolor");
  const [modelProvider, setModelProvider] = useState("gemini");
  const [modelName, setModelName] = useState("gemini-3.5-flash");

  // Flow state
  const [flowState, setFlowState] = useState<FlowState>("input");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Model discovery
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Brief
  const [activeBrief, setActiveBrief] = useState<BriefOut | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [regenField, setRegenField] = useState<string | null>(null);

  // Draft & generation
  const [draft, setDraft] = useState<BookOut | null>(null);
  const [generating, setGenerating] = useState(false);

  // One-click
  const [oneClickRunning, setOneClickRunning] = useState(false);
  const [oneClickStage, setOneClickStage] = useState<OneClickStage>("writing");
  const [oneClickProgress, setOneClickProgress] = useState({ done: 0, total: 0 });
  const [oneClickBook, setOneClickBook] = useState<BookOut | null>(null);

  useEffect(() => {
    if (!token) return;
    setModelsLoading(true);
    api.books.models(token)
      .then((d) => {
        setProviders(d.providers);
        const first = d.providers.find((p) => p.available);
        if (first) { setModelProvider(first.id); if (first.models[0]) setModelName(first.models[0].id); }
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, [token]);

  const briefParams = {
    raw_prompt: prompt,
    age_range: age,
    tone,
    safety_mode: safety,
    page_count: pageCount,
    model_provider: modelProvider,
    model_name: modelName,
  };

  async function fetchBrief(existingDraft?: BookOut) {
    if (!token) { toast.error("Please sign in first"); return false; }
    setBriefLoading(true);
    setActiveBrief(null);
    try {
      if (!existingDraft && !draft) {
        const saved = await api.books.createDraft(token, {
          raw_prompt: prompt, age_range: age, tone, safety_mode: safety,
          page_count: pageCount, model_provider: modelProvider, model_name: modelName,
        });
        setDraft(saved);
        setBook(saved);
      }
      const brief = await api.books.generateBrief(token, briefParams);
      setActiveBrief(brief);
      return true;
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate brief");
      return false;
    } finally {
      setBriefLoading(false);
    }
  }

  async function regenerateField(field: keyof BriefOut) {
    if (!token || !activeBrief) return;
    setRegenField(field);
    try {
      const updated = await api.books.regenerateBriefField(token, { ...briefParams, current_brief: activeBrief, field });
      setActiveBrief(updated);
    } catch (err: any) {
      toast.error(err.message ?? `Failed to regenerate ${field}`);
    } finally {
      setRegenField(null);
    }
  }

  function updateBriefField(field: keyof BriefOut, value: string) {
    if (!activeBrief) return;
    setActiveBrief({ ...activeBrief, [field]: value });
  }

  async function handleEnhance() {
    if (!token) { toast.error("Please sign in first"); return; }
    if (prompt.trim().length < 10) { toast.error("Tell us a bit more about your story"); return; }
    setFlowState("enhancing");
    const ok = await fetchBrief();
    setFlowState(ok ? "brief" : "input");
  }

  async function generateBook() {
    if (!token) { toast.error("Please sign in first"); return; }
    if (!activeBrief) return;
    setGenerating(true);
    try {
      let book;
      if (draft) {
        book = await api.books.generate(token, draft.id, style);
      } else {
        book = await api.books.create(token, {
          raw_prompt: prompt, age_range: age, tone, art_style: style,
          safety_mode: safety, page_count: pageCount, model_provider: modelProvider, model_name: modelName,
        });
      }
      setBook(book);
      router.push("/outline");
    } catch (err: any) {
      toast.error(err.message ?? "Generation failed. Please try again.");
      setGenerating(false);
    }
  }

  async function handleOneClick() {
    if (!token) { toast.error("Please sign in first"); return; }
    if (prompt.trim().length < 10) { toast.error("Tell us a bit more about your story"); return; }
    setOneClickRunning(true);
    setOneClickStage("writing");
    setOneClickProgress({ done: 0, total: 0 });
    try {
      const savedDraft = await api.books.createDraft(token, {
        raw_prompt: prompt, age_range: age,
        tone: tone.length > 0 ? tone : ["Whimsical"],
        safety_mode: safety, page_count: pageCount, model_provider: modelProvider, model_name: modelName,
      });
      setBook(savedDraft);
      const generated = await api.books.generate(token, savedDraft.id, style);
      setBook(generated);
      setOneClickStage("characters");
      setOneClickProgress({ done: 0, total: 0 });
      const withChars = await api.books.generateCharacterSheets(token, generated.id);
      setBook(withChars);
      setOneClickStage("illustrating");
      const pages = [...withChars.pages].sort((a, b) => a.order - b.order);
      setOneClickProgress({ done: 0, total: pages.length });
      let currentBook = withChars;
      for (let i = 0; i < pages.length; i++) {
        const updated = await api.books.illustratePage(token, withChars.id, pages[i].id);
        setBook(updated); currentBook = updated;
        setOneClickProgress({ done: i + 1, total: pages.length });
      }
      setOneClickStage("narrating");
      const textPages = [...currentBook.pages].sort((a, b) => a.order - b.order).filter((p) => p.text);
      setOneClickProgress({ done: 0, total: textPages.length });
      for (let i = 0; i < textPages.length; i++) {
        const updated = await api.books.narratePage(token, currentBook.id, textPages[i].id);
        setBook(updated); currentBook = updated;
        setOneClickProgress({ done: i + 1, total: textPages.length });
      }
      setOneClickStage("done");
      setOneClickBook(currentBook);
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong. Please try again.");
      setOneClickRunning(false);
    }
  }

  const optionsProps = {
    age, setAge, tone, setTone, customTones, setCustomTones,
    customToneInput, setCustomToneInput, style, setStyle,
    pageCount, setPageCount, isCustomPageCount, setIsCustomPageCount,
    customPageCountInput, setCustomPageCountInput, safety, setSafety,
    modelProvider, setModelProvider, modelName, setModelName,
    providers, modelsLoading, prompt, onOneClick: handleOneClick,
  };

  const briefFields: { key: keyof BriefOut; label: string; multiline?: boolean }[] = [
    { key: "title", label: "Title" },
    { key: "description", label: "Story", multiline: true },
    { key: "lesson", label: "Lesson" },
  ];

  return (
    <>
      {generating && <GeneratingOverlay />}
      {oneClickRunning && (
        <OneClickOverlay stage={oneClickStage} progress={oneClickProgress} book={oneClickBook} onView={() => router.push("/reader")} />
      )}

      <main className="flex h-[calc(100vh-4rem)] overflow-hidden">

        {/* ── Left pane ─────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">

              {/* ── Input state ── */}
              {flowState === "input" && (
                <motion.div key="input" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="flex flex-col min-h-full px-6 py-8 md:px-10 md:py-10">
                  <div className="max-w-2xl w-full mx-auto flex flex-col flex-1">
                    <h1 className="font-display text-4xl font-black md:text-5xl leading-tight">
                      What&apos;s your story about?
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                      One sentence is enough — we&apos;ll build the rest.
                    </p>

                    {/* Textarea */}
                    <div className="relative mt-6">
                      <textarea
                        value={prompt}
                        onChange={(e) => { const val = e.target.value; if (wordCount(val) <= PROMPT_MAX_WORDS) setPrompt(val); }}
                        rows={6}
                        placeholder="A brave little fox who learns to share…"
                        className="w-full resize-none rounded-2xl bg-card p-5 pb-10 text-lg outline-none chunky-border focus:ring-4 focus:ring-primary/30"
                      />
                      <div className="absolute bottom-3 right-4 flex items-center gap-2">
                        <span className={`text-xs font-bold tabular-nums transition-colors ${
                          wordCount(prompt) >= PROMPT_MAX_WORDS ? "text-destructive"
                          : wordCount(prompt) >= PROMPT_MAX_WORDS * 0.85 ? "text-amber-500"
                          : "text-muted-foreground"
                        }`}>
                          {wordCount(prompt)} / {PROMPT_MAX_WORDS} words
                        </span>
                        {prompt.trim().length > 0 && (
                          <span className="text-xs text-muted-foreground/50">· {prompt.trim().length} chars</span>
                        )}
                      </div>
                    </div>

                    {/* Examples */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {EXAMPLES.map((ex) => (
                        <button key={ex} onClick={() => setPrompt(ex)} className="rounded-full bg-card px-3 py-1.5 text-sm font-bold chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
                          ✦ {ex}
                        </button>
                      ))}
                    </div>

                    {/* CTAs */}
                    <div className="mt-8 flex flex-col gap-3">
                      <button
                        onClick={handleEnhance}
                        disabled={prompt.trim().length < 10}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0"
                      >
                        <Sparkles className="h-5 w-5" strokeWidth={2.5} />
                        Enhance &amp; preview story →
                      </button>
                      <p className="text-center text-xs text-muted-foreground">
                        AI will expand your idea into a full brief — you can edit before generating.
                      </p>
                    </div>

                    {/* Mobile settings toggle */}
                    <div className="mt-6 lg:hidden">
                      <button
                        onClick={() => setSettingsOpen((o) => !o)}
                        className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 font-extrabold chunky-border"
                      >
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} />
                          Story settings
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
                      </button>
                      <AnimatePresence>
                        {settingsOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 rounded-2xl bg-card p-4 chunky-border">
                              <OptionsPanel {...optionsProps} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Enhancing state ── */}
              {flowState === "enhancing" && (
                <motion.div key="enhancing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-full items-center justify-center px-6 py-10">
                  <div className="flex flex-col items-center gap-5 text-center max-w-sm">
                    <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
                      <Sparkles className="h-9 w-9 text-primary-foreground" strokeWidth={1.5} />
                      <span className="absolute -right-2 -top-2 h-5 w-5 animate-spin rounded-full border-[3px] border-foreground border-t-transparent" />
                    </div>
                    <div>
                      <h2 className="font-display text-3xl font-black">Enhancing your idea…</h2>
                      <p className="mt-1.5 text-muted-foreground text-sm">
                        Building a title, story summary &amp; lesson for you to review.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-card px-4 py-3 chunky-border text-sm text-muted-foreground font-semibold max-w-xs">
                      &ldquo;{prompt.trim().substring(0, 80)}{prompt.trim().length > 80 ? "…" : ""}&rdquo;
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Brief review state ── */}
              {flowState === "brief" && (
                <motion.div key="brief" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }} className="flex flex-col min-h-full px-6 py-8 md:px-10 md:py-10">
                  <div className="max-w-2xl w-full mx-auto">
                    {/* Back + header */}
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div>
                        <button
                          onClick={() => setFlowState("input")}
                          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
                        >
                          <ArrowLeft className="h-3 w-3" strokeWidth={3} /> Edit prompt
                        </button>
                        <h1 className="font-display text-3xl font-black md:text-4xl">Your story brief</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Edit any field or regenerate — then generate your book.
                        </p>
                      </div>
                      <button
                        onClick={() => fetchBrief(draft ?? undefined)}
                        disabled={briefLoading}
                        className="shrink-0 flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-extrabold chunky-border disabled:opacity-50 hover:-translate-y-0.5 transition-transform"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${briefLoading ? "animate-spin" : ""}`} strokeWidth={2.5} />
                        Regenerate all
                      </button>
                    </div>

                    {/* Original prompt pill */}
                    <div className="mb-5 rounded-xl bg-muted/60 px-4 py-2.5 chunky-border">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-0.5">Your prompt</p>
                      <p className="text-sm font-semibold text-foreground/80">{prompt}</p>
                    </div>

                    {/* Brief fields */}
                    {briefLoading ? (
                      <div className="flex flex-col items-center gap-4 py-12">
                        <Loader2 className="h-9 w-9 animate-spin text-primary" />
                        <p className="font-bold text-muted-foreground">Regenerating brief…</p>
                      </div>
                    ) : activeBrief ? (
                      <div className="grid gap-3">
                        {briefFields.map(({ key, label, multiline }) => (
                          <BriefFieldRow
                            key={key}
                            label={label}
                            value={activeBrief[key] as string}
                            multiline={multiline}
                            onEdit={(v) => updateBriefField(key, v)}
                            onRegenerate={() => regenerateField(key)}
                            regenerating={regenField === key}
                          />
                        ))}
                      </div>
                    ) : null}

                    {/* Settings summary pill */}
                    {activeBrief && (
                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
                        <span className="rounded-full bg-card px-3 py-1 chunky-border">Ages {age}</span>
                        <span className="rounded-full bg-card px-3 py-1 chunky-border">{pageCount} pages</span>
                        <span className="rounded-full bg-card px-3 py-1 chunky-border capitalize">{style}</span>
                        <span className="rounded-full bg-card px-3 py-1 chunky-border flex items-center gap-1">
                          {modelProvider === "ollama" ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
                          {modelName}
                        </span>
                      </div>
                    )}

                    {/* Generate CTA */}
                    <div className="mt-6">
                      <button
                        onClick={generateBook}
                        disabled={!activeBrief || briefLoading}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0"
                      >
                        <BookOpen className="h-5 w-5" strokeWidth={2} />
                        Generate my book →
                      </button>
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        Takes about a minute · You&apos;ll be able to illustrate &amp; narrate next.
                      </p>
                    </div>

                    {/* Mobile settings toggle (brief view) */}
                    <div className="mt-6 lg:hidden">
                      <button
                        onClick={() => setSettingsOpen((o) => !o)}
                        className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 font-extrabold chunky-border"
                      >
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} />
                          Story settings
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
                      </button>
                      <AnimatePresence>
                        {settingsOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                            <div className="mt-3 rounded-2xl bg-card p-4 chunky-border">
                              <OptionsPanel {...optionsProps} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>

        {/* ── Right pane — options (desktop only) ───────────────────────────── */}
        <div className="hidden lg:flex w-[360px] xl:w-[400px] shrink-0 flex-col overflow-y-auto border-l-[2.5px] border-foreground bg-card/40">
          <div className="sticky top-0 z-10 border-b-[2px] border-foreground bg-card/90 backdrop-blur px-5 py-3.5">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} />
              <span className="font-display text-sm font-black uppercase tracking-wide">Story settings</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <OptionsPanel {...optionsProps} />
          </div>
        </div>

      </main>
    </>
  );
}
