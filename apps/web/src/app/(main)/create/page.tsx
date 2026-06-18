"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
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
  FileText,
  Lightbulb,
  Map,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, type BookOut, type BriefOut, type ExpandedPromptOut, type PageOut, type ProviderInfo, type StorySeedOut } from "@/lib/api";
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
const PROMPT_MAX_WORDS = 200;

function wordCount(text: string) {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

function truncateToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text;
  return words.slice(0, max).join(" ");
}

// ── Elapsed timer ─────────────────────────────────────────────────────────────

function useElapsedTimer(running = true) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── Writing spinner messages ──────────────────────────────────────────────────

const STATIC_WRITING_MSGS = [
  "Sharpening pencils…",
  "Sprinkling story dust…",
  "Untangling plot knots…",
  "Finding the perfect words…",
  "Deciding what happens next…",
  "Adding a surprise on page 3…",
  "Making sure the ending lands…",
  "Checking for plot holes…",
  "Giving the villain a bad day…",
  "Making the hero earn it…",
  "Adding a twist nobody saw coming…",
  "Polishing every sentence…",
  "Double-checking the pacing…",
  "Setting the scene just right…",
];

function buildWritingMessages(brief: BriefOut | null): string[] {
  const msgs = [...STATIC_WRITING_MSGS];
  if (!brief) return msgs;

  // Dynamic: character-based
  const chars = brief.characters_intro ?? [];
  if (chars.length > 0) {
    const first = chars[0].split(" ")[0];
    msgs.push(`Introducing ${first} to the world…`);
    msgs.push(`Figuring out what ${first} does on page one…`);
    if (chars.length > 1) {
      const second = chars[1].split(" ")[0];
      msgs.push(`Writing the moment ${first} meets ${second}…`);
      msgs.push(`Giving ${second} something important to do…`);
    }
    if (chars.length > 2) {
      const third = chars[2].split(" ")[0];
      msgs.push(`Making sure ${third} gets their moment…`);
    }
  }

  // Dynamic: theme-based
  const themes = brief.themes ?? [];
  if (themes.length > 0) {
    msgs.push(`Weaving in a little "${themes[0]}"…`);
    if (themes.length > 1) msgs.push(`Hiding a "${themes[1]}" moment mid-story…`);
  }

  // Dynamic: title/lesson
  if (brief.title) {
    msgs.push(`Crafting "${brief.title}" page by page…`);
  }
  if (brief.lesson) {
    msgs.push(`Sneaking in the lesson: ${brief.lesson.slice(0, 40)}${brief.lesson.length > 40 ? "…" : ""}`);
  }

  // Dynamic: arc stages
  const arc = brief.arc ?? [];
  if (arc.length > 0) {
    msgs.push(`Writing the ${arc[0].name} section…`);
    if (arc.length > 1) msgs.push(`Hitting the "${arc[1].name}" beat…`);
  }

  return msgs;
}

function useWritingMessages(brief: BriefOut | null, intervalMs = 2400) {
  const [idx, setIdx] = useState(0);
  const msgs = useRef<string[]>([]);

  useEffect(() => {
    msgs.current = buildWritingMessages(brief).sort(() => Math.random() - 0.5);
    setIdx(0);
  }, [brief]);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % (msgs.current.length || 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return msgs.current[idx] ?? "Writing your pages…";
}

// ── One-click overlay ─────────────────────────────────────────────────────────

const ONE_CLICK_HINTS: Record<string, string[]> = {
  writing:      ["Crafting your story arc…", "Picking the perfect words…", "Weaving plot twists 🌀"],
  characters:   ["Sketching character traits…", "Deciding who's the hero 🦊", "Giving everyone backstories…"],
  illustrating: ["Painting the scenes…", "Adding colour and detail 🎨", "Bringing characters to life…"],
  narrating:    ["Finding the perfect voice 🎙️", "Adding emotion to each line…"],
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
  const timer = useElapsedTimer(stage !== "done");
  useEffect(() => { setHintIdx(0); }, [stage]);
  useEffect(() => {
    if (stage === "done") return;
    const t = setInterval(() => setHintIdx((h) => h + 1), 3000);
    return () => clearInterval(t);
  }, [stage]);

  const stageIdx = ONE_CLICK_STAGES.findIndex((s) => s.id === stage);
  const isDone = stage === "done";
  const overallPct = isDone ? 100
    : stageIdx === 0 ? 10 : stageIdx === 1 ? 25
    : stageIdx === 2 ? 40 + (progress.total > 0 ? (progress.done / progress.total) * 30 : 0)
    : 70 + (progress.total > 0 ? (progress.done / progress.total) * 27 : 0);
  const stageLabel =
    stage === "writing" ? "Writing your story…"
    : stage === "characters" ? "Designing character sheets…"
    : stage === "illustrating" ? `Illustrating pages…${progress.total > 0 ? ` (${progress.done}/${progress.total})` : ""}`
    : stage === "narrating" ? `Adding narration…${progress.total > 0 ? ` (${progress.done}/${progress.total})` : ""}`
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
                <motion.p key={stageLabel} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="mt-1 text-sm font-extrabold text-foreground/80">{stageLabel}</motion.p>
              </AnimatePresence>
              <AnimatePresence mode="wait">
                <motion.p key={hint} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-1 text-xs text-muted-foreground">{hint}</motion.p>
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
                const done = i < stageIdx; const active = i === stageIdx;
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Options panel ─────────────────────────────────────────────────────────────

function OptionsPanel({
  age, setAge, tone, setTone, customTones, setCustomTones,
  customToneInput, setCustomToneInput, style, setStyle,
  pageCount, setPageCount, isCustomPageCount, setIsCustomPageCount,
  customPageCountInput, setCustomPageCountInput, safety, setSafety,
  modelProvider, setModelProvider, modelName, setModelName,
  providers, modelsLoading, prompt, onOneClick, locked,
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
  prompt: string; onOneClick: () => void; locked?: boolean;
}) {
  return (
    <div className={`space-y-5 ${locked ? "opacity-60 pointer-events-none select-none" : ""}`}>
      {locked && (
        <div className="rounded-xl bg-muted/60 px-3 py-2 text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          <Check className="h-3 w-3" strokeWidth={3} /> Settings locked in
        </div>
      )}

      {/* Age range */}
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Reading level</p>
        <div className="grid grid-cols-3 gap-2">
          {["3-5", "6-8", "9-11"].map((a) => (
            <button key={a} onClick={() => setAge(a)} className={`rounded-xl px-3 py-2.5 text-sm font-extrabold chunky-border transition-all hover:-translate-y-0.5 ${age === a ? "bg-primary text-primary-foreground chunky-shadow-sm" : "bg-background"}`}>Ages {a}</button>
          ))}
        </div>
      </div>

      {/* Themes */}
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Themes &amp; Tone</p>
        <div className="flex flex-wrap gap-1.5">
          {[...TONES_PRESET, ...customTones].map((t) => {
            const on = tone.includes(t); const isCustom = customTones.includes(t);
            return (
              <button key={t} onClick={() => setTone(on ? tone.filter((x) => x !== t) : [...tone, t])}
                className={`group relative rounded-full px-3 py-1.5 text-xs font-bold chunky-border transition-transform hover:-translate-y-0.5 ${on ? "bg-accent text-accent-foreground chunky-shadow-sm" : "bg-background"}`}>
                {t}
                {isCustom && (
                  <span role="button" onClick={(e) => { e.stopPropagation(); setCustomTones(customTones.filter((c) => c !== t)); setTone(tone.filter((x) => x !== t)); }}
                    className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="h-2 w-2" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
          <div className="flex items-center gap-1">
            <input value={customToneInput} onChange={(e) => setCustomToneInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && customToneInput.trim()) { const v = customToneInput.trim(); if (!customTones.includes(v) && !TONES_PRESET.includes(v)) { setCustomTones([...customTones, v]); setTone([...tone, v]); } setCustomToneInput(""); } }}
              placeholder="Custom…" className="h-[30px] w-24 rounded-full bg-background px-2.5 text-xs font-bold chunky-border outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60" />
            <button onClick={() => { const v = customToneInput.trim(); if (!v) return; if (!customTones.includes(v) && !TONES_PRESET.includes(v)) { setCustomTones([...customTones, v]); setTone([...tone, v]); } setCustomToneInput(""); }}
              disabled={!customToneInput.trim()} className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground chunky-border disabled:opacity-40">
              <Plus className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>
        </div>
        {tone.length > 0 && <p className="mt-1 text-xs text-muted-foreground font-semibold">{tone.length} theme{tone.length !== 1 ? "s" : ""} selected</p>}
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
                  {s.label} {on && <Check className="h-3 w-3" strokeWidth={3} />}
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
            <button key={n} onClick={() => { setPageCount(n); setIsCustomPageCount(false); }} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold chunky-border transition-transform hover:-translate-y-0.5 ${!isCustomPageCount && pageCount === n ? "bg-primary text-primary-foreground chunky-shadow-sm" : "bg-background"}`}>{n}</button>
          ))}
          <button onClick={() => setIsCustomPageCount(true)} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold chunky-border transition-transform hover:-translate-y-0.5 ${isCustomPageCount ? "bg-primary text-primary-foreground chunky-shadow-sm" : "bg-background"}`}>Custom</button>
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Detecting models…</div>
        ) : (
          <div className="space-y-2">
            {(providers.length > 0 ? providers : [{ id: "gemini", name: "Google Gemini", description: "Cloud-hosted", available: true, models: [{ id: "gemini-3.5-flash", name: "Gemini Flash", description: "Fast & efficient", size: "cloud" }, { id: "gemini-1.5-pro", name: "Gemini Pro", description: "Highest quality", size: "cloud" }] }]).map((provider) => (
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
                          <div className={`text-[11px] mt-0.5 ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{m.description}</div>
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

      {/* One-click */}
      {!locked && (
        <div className="rounded-2xl bg-primary/5 p-4 chunky-border">
          <div className="flex items-start gap-3 mb-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary chunky-border">
              <Wand2 className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-extrabold">Make it for me</p>
              <p className="text-xs text-muted-foreground mt-0.5">Writes, illustrates &amp; narrates your book automatically.</p>
            </div>
          </div>
          <button onClick={onOneClick} disabled={prompt.trim().length < 10}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0">
            <Wand2 className="h-4 w-4" strokeWidth={2.5} /> Fully automatic
          </button>
        </div>
      )}
    </div>
  );
}

// ── Locked settings summary (brief + writing states) ─────────────────────────

function LockedSettingsSummary({ age, tone, style, pageCount, safety, modelName, modelProvider, onEdit }: {
  age: string; tone: string[]; style: string; pageCount: number; safety: boolean;
  modelName: string; modelProvider: string; onEdit: () => void;
}) {
  const styleLabel = { watercolor: "Watercolor", crayon: "Crayon", flat: "Flat", papercut: "Papercut" }[style] ?? style;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-background p-4 chunky-border space-y-3">
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Locked settings</p>

        {[
          { label: "Reading level", value: `Ages ${age}` },
          { label: "Pages", value: `${pageCount} pages` },
          { label: "Art style", value: styleLabel },
          { label: "Safety", value: safety ? "On" : "Off" },
          { label: "Model", value: modelName },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-semibold">{label}</span>
            <span className="font-extrabold">{value}</span>
          </div>
        ))}

        {tone.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground font-semibold mb-1.5">Themes</p>
            <div className="flex flex-wrap gap-1">
              {tone.slice(0, 6).map((t) => (
                <span key={t} className="rounded-full bg-accent/60 px-2.5 py-0.5 text-xs font-bold">{t}</span>
              ))}
              {tone.length > 6 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">+{tone.length - 6}</span>}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onEdit}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-card px-4 py-2.5 text-xs font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={3} /> Edit prompt &amp; settings
      </button>
    </div>
  );
}

// ── Brief summary sidebar (for pages review state) ────────────────────────────

function BriefSummaryPanel({ brief, age, pageCount, style, modelName, modelProvider }: {
  brief: BriefOut; age: string; pageCount: number; style: string; modelName: string; modelProvider: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-1">Approved brief</p>
        <div className="rounded-2xl bg-background p-4 chunky-border space-y-3">
          <div>
            <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">Title</p>
            <p className="mt-0.5 font-display text-base font-black">{brief.title}</p>
          </div>
          <div>
            <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">Story</p>
            <p className="mt-0.5 text-xs font-semibold text-foreground/80 leading-relaxed">{brief.description}</p>
          </div>
          <div>
            <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">Lesson</p>
            <p className="mt-0.5 text-xs font-semibold text-foreground/80">{brief.lesson}</p>
          </div>
          {brief.themes.length > 0 && (
            <div>
              <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider mb-1">Themes</p>
              <div className="flex flex-wrap gap-1">
                {brief.themes.map((t) => <span key={t} className="rounded-full bg-card px-2 py-0.5 text-xs font-bold chunky-border">{t}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="rounded-2xl bg-background p-4 chunky-border">
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Settings</p>
        <div className="space-y-1.5 text-xs font-semibold text-muted-foreground">
          <div className="flex justify-between"><span>Reading level</span><span className="font-bold text-foreground">Ages {age}</span></div>
          <div className="flex justify-between"><span>Pages</span><span className="font-bold text-foreground">{pageCount}</span></div>
          <div className="flex justify-between"><span>Art style</span><span className="font-bold text-foreground capitalize">{style}</span></div>
          <div className="flex justify-between"><span>Model</span><span className="font-bold text-foreground flex items-center gap-1">{modelProvider === "ollama" ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}{modelName}</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────

function EditableField({ label, value, multiline, onSave, onRegenerate, regenerating }: {
  label: string; value: string; multiline?: boolean;
  onSave: (v: string) => void; onRegenerate?: () => void; regenerating?: boolean;
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
          {onRegenerate && (
            <button onClick={onRegenerate} disabled={regenerating} className="rounded-full bg-card p-1.5 chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-50" title="Regenerate">
              {regenerating ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} /> : <RefreshCw className="h-3 w-3" strokeWidth={2.5} />}
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div>
          {multiline
            ? <textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full resize-none rounded-xl bg-card px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30" />
            : <input value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full rounded-xl bg-card px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30" />
          }
          <div className="mt-2 flex gap-2">
            <button onClick={() => { onSave(draft); setEditing(false); }} className="rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground chunky-border">Save</button>
            <button onClick={() => setEditing(false)} className="rounded-full bg-background px-3 py-1 text-xs font-extrabold chunky-border">Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text-sm font-semibold leading-snug">{value}</p>
      )}
    </div>
  );
}

// ── Page review card ──────────────────────────────────────────────────────────

function PageReviewCard({ page, bookId, token, onUpdate }: {
  page: PageOut; bookId: string; token: string;
  onUpdate: (updated: BookOut) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page.text ?? "");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(page.text ?? ""); }, [page.text]);

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const updated = await api.books.updatePage(token, bookId, page.id, { text: draft });
      onUpdate(updated);
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const updated = await api.books.regeneratePage(token, bookId, page.id);
      onUpdate(updated);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  }

  const roleColor: Record<string, string> = {
    hook: "bg-yellow-100 text-yellow-800",
    rising_action: "bg-blue-100 text-blue-800",
    climax: "bg-red-100 text-red-800",
    resolution: "bg-green-100 text-green-800",
    conclusion: "bg-purple-100 text-purple-800",
  };

  return (
    <div className="rounded-2xl bg-background chunky-border overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 py-3 border-b-[2px] border-foreground bg-card">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground chunky-border">
            {page.is_cover ? "C" : page.order}
          </span>
          <div>
            <span className="text-sm font-extrabold">{page.is_cover ? "Cover" : `Page ${page.order}`}</span>
            {page.beat && <span className="ml-2 text-xs text-muted-foreground font-semibold">{page.beat}</span>}
          </div>
          {page.narrative_role && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${roleColor[page.narrative_role] ?? "bg-muted text-muted-foreground"}`}>
              {page.narrative_role.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <button onClick={() => { setDraft(page.text ?? ""); setEditing(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
              className="rounded-full bg-background px-2.5 py-1 text-xs font-bold chunky-border hover:-translate-y-0.5 transition-transform flex items-center gap-1">
              <Pencil className="h-3 w-3" strokeWidth={2.5} /> Edit
            </button>
          )}
          <button onClick={handleRegenerate} disabled={regenerating || editing}
            className="rounded-full bg-background px-2.5 py-1 text-xs font-bold chunky-border hover:-translate-y-0.5 transition-transform flex items-center gap-1 disabled:opacity-50">
            {regenerating ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} /> : <RotateCcw className="h-3 w-3" strokeWidth={2.5} />}
            {regenerating ? "Rewriting…" : "Regenerate"}
          </button>
        </div>
      </div>

      {/* Page text */}
      <div className="p-4">
        {editing ? (
          <div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              className="w-full resize-none rounded-xl bg-card px-3 py-2.5 text-sm font-semibold leading-relaxed chunky-border outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="mt-2 flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground chunky-border disabled:opacity-50">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" strokeWidth={3} />}
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={() => { setEditing(false); setDraft(page.text ?? ""); }} className="rounded-full bg-background px-3 py-1.5 text-xs font-extrabold chunky-border">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold leading-relaxed text-foreground/90">
            {page.text ?? <span className="text-muted-foreground italic">No text generated</span>}
          </p>
        )}

        {/* Metadata chips */}
        {(page.emotional_note || page.setting_note || (page.characters_present?.length ?? 0) > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold text-muted-foreground border-t-[1.5px] border-foreground/10 pt-3">
            {page.setting_note && <span className="rounded-full bg-card px-2 py-0.5 chunky-border">📍 {page.setting_note}</span>}
            {page.emotional_note && <span className="rounded-full bg-card px-2 py-0.5 chunky-border">💭 {page.emotional_note}</span>}
            {page.characters_present?.map((c) => <span key={c} className="rounded-full bg-card px-2 py-0.5 chunky-border">👤 {c}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single concept card ───────────────────────────────────────────────────────

// ── Enhanced prompt review panel ─────────────────────────────────────────────

function EnhancedPromptReview({
  expanded,
  loading,
  onRegenerate,
  onApprove,
}: {
  expanded: ExpandedPromptOut | null;
  loading: boolean;
  onRegenerate: () => void;
  onApprove: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-20 text-center">
        <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
          <Wand2 className="h-9 w-9 text-primary-foreground" strokeWidth={1.5} />
          <span className="absolute -right-2 -top-2 h-5 w-5 animate-spin rounded-full border-[3px] border-foreground border-t-transparent" />
        </div>
        <div>
          <p className="font-display text-2xl font-black">Expanding your idea…</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Adding characters, scenes &amp; visual style</p>
        </div>
      </div>
    );
  }
  if (!expanded) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-background p-4 chunky-border">
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-1">Suggested title</p>
        <p className="font-display text-2xl font-black">{expanded.title}</p>
      </div>

      <div className="rounded-2xl bg-background p-4 chunky-border">
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Story concept</p>
        <p className="text-sm font-semibold leading-relaxed text-foreground/80">{expanded.story_concept}</p>
      </div>

      {expanded.key_characters.length > 0 && (
        <div className="rounded-2xl bg-background p-4 chunky-border">
          <div className="flex items-center gap-1.5 mb-3">
            <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Characters</p>
          </div>
          <div className="space-y-1.5">
            {expanded.key_characters.map((c, i) => (
              <div key={i} className="flex items-start gap-2 rounded-xl bg-card px-3 py-2 chunky-border">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">{i + 1}</span>
                <p className="text-sm font-semibold leading-snug">{c}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {expanded.story_highlights.length > 0 && (
        <div className="rounded-2xl bg-background p-4 chunky-border">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Scene highlights</p>
          </div>
          <div className="space-y-1.5">
            {expanded.story_highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <p className="text-sm font-semibold leading-snug text-foreground/80">{h}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {expanded.themes.length > 0 && (
          <div className="rounded-2xl bg-background p-4 chunky-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Themes</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">✦ added to settings</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {expanded.themes.map((t) => (
                <span key={t} className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-bold chunky-border">{t}</span>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-2xl bg-background p-4 chunky-border">
          <div className="flex items-center gap-1.5 mb-2">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Visual style</p>
          </div>
          <p className="text-xs font-semibold leading-relaxed text-foreground/80">{expanded.visual_style}</p>
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onRegenerate}
          className="flex items-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">
          <RefreshCw className="h-4 w-4" strokeWidth={2.5} /> Try again
        </button>
        <button onClick={onApprove}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform">
          <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Generate brief →
        </button>
      </div>
    </div>
  );
}

// ── Step progress indicator ───────────────────────────────────────────────────

const STEPS = [
  { id: "input",   label: "Prompt"  },
  { id: "concept", label: "Concept" },
  { id: "brief",   label: "Brief"   },
  { id: "review",  label: "Review"  },
];

type FlowState = "input" | "enhancing" | "enhanced" | "brief" | "writing" | "pages";

function flowToStepIdx(state: FlowState): number {
  if (state === "input")     return 0;
  if (state === "enhancing" || state === "enhanced") return 1;
  if (state === "brief")     return 2;
  return 3; // writing | pages
}

function StepBar({ current }: { current: FlowState }) {
  const idx = flowToStepIdx(current);
  return (
    <div className="flex items-center gap-1 shrink-0">
      {STEPS.map((s, i) => {
        const done = i < idx; const active = i === idx;
        return (
          <div key={s.id} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold transition-all chunky-border ${active ? "bg-primary text-primary-foreground" : done ? "bg-foreground text-background" : "bg-card text-muted-foreground"}`}>
              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className="tabular-nums">{i + 1}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className={`h-3 w-3 shrink-0 ${i < idx ? "text-foreground" : "text-muted-foreground/40"}`} strokeWidth={2.5} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();
  const { token } = useAuth();
  const { setBook } = useBook();

  // Prompt + settings
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

  // Flow
  const [flowState, setFlowState] = useState<FlowState>("input");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Brainstorm (idea sparks on input screen)
  const [brainstormSeeds, setBrainstormSeeds] = useState<StorySeedOut[]>([]);
  const [brainstormLoading, setBrainstormLoading] = useState(false);
  const [brainstormOpen, setBrainstormOpen] = useState(false);

  // Expanded prompt (concept step)
  const [expandedPrompt, setExpandedPrompt] = useState<ExpandedPromptOut | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);

  // Models
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Brief
  const [activeBrief, setActiveBrief] = useState<BriefOut | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [regenField, setRegenField] = useState<string | null>(null);

  // Book + pages
  const [draft, setDraft] = useState<BookOut | null>(null);
  const [currentBook, setCurrentBook] = useState<BookOut | null>(null);

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
    raw_prompt: prompt, age_range: age, tone, safety_mode: safety,
    page_count: pageCount, model_provider: modelProvider, model_name: modelName,
    expanded_concept: expandedPrompt ?? undefined,
  };

  // ── Brainstorm: generate idea sparks ──────────────────────────────────────

  async function handleBrainstorm() {
    if (!token) { toast.error("Please sign in first"); return; }
    setBrainstormLoading(true);
    setBrainstormSeeds([]);
    setBrainstormOpen(true);
    try {
      const result = await api.books.brainstorm(token, { age_range: age, tone, page_count: pageCount });
      setBrainstormSeeds(result.seeds);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate ideas");
    } finally {
      setBrainstormLoading(false);
    }
  }

  // ── Step 1 → 2: Expand prompt into a rich concept ────────────────────────

  async function handleExpandPrompt() {
    if (!token) { toast.error("Please sign in first"); return; }
    if (prompt.trim().length < 3) { toast.error("Tell us a bit more about your story"); return; }
    setExpandLoading(true);
    setExpandedPrompt(null);
    setFlowState("enhancing");
    try {
      const result = await api.books.expandPrompt(token, {
        raw_prompt: prompt, age_range: age, tone, safety_mode: safety, page_count: pageCount,
      });
      setExpandedPrompt(result);
      // Merge AI themes into tone selection
      if (result.themes.length > 0) {
        setTone((prev) => {
          const merged = [...prev];
          for (const t of result.themes) {
            if (!merged.includes(t)) merged.push(t);
          }
          return merged;
        });
      }
      setFlowState("enhanced");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to expand prompt");
      setFlowState("input");
    } finally {
      setExpandLoading(false);
    }
  }

  // ── Step 2 → 3: Generate brief from approved concept ──────────────────────

  async function handleGenerateBrief() {
    if (!token) { toast.error("Please sign in first"); return; }
    setBriefLoading(true);
    setActiveBrief(null);
    setFlowState("brief");
    try {
      if (!draft) {
        const saved = await api.books.createDraft(token, {
          raw_prompt: prompt, age_range: age, tone, safety_mode: safety,
          page_count: pageCount, model_provider: modelProvider, model_name: modelName,
        });
        setDraft(saved);
        setBook(saved);
      }
      const brief = await api.books.generateBrief(token, briefParams);
      setActiveBrief(brief);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate brief");
      setFlowState("enhanced");
    } finally {
      setBriefLoading(false);
    }
  }

  async function regenerateField(field: keyof BriefOut) {
    if (!token || !activeBrief) return;
    setRegenField(field as string);
    try {
      const updated = await api.books.regenerateBriefField(token, { ...briefParams, current_brief: activeBrief, field: field as string });
      setActiveBrief(updated);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to regenerate");
    } finally {
      setRegenField(null);
    }
  }

  function updateBriefField(field: keyof BriefOut, value: string) {
    if (!activeBrief) return;
    setActiveBrief({ ...activeBrief, [field]: value });
  }

  // ── Step 2 → 3 → 4: Write pages ────────────────────────────────────────────

  async function handleWritePages() {
    if (!token || !activeBrief) return;
    setFlowState("writing");
    try {
      let book: BookOut;
      if (draft) {
        book = await api.books.generate(token, draft.id, style);
      } else {
        book = await api.books.create(token, {
          raw_prompt: prompt, age_range: age, tone, art_style: style,
          safety_mode: safety, page_count: pageCount, model_provider: modelProvider, model_name: modelName,
        });
      }
      setCurrentBook(book);
      setBook(book);
      setFlowState("pages");
    } catch (err: any) {
      toast.error(err.message ?? "Writing failed. Please try again.");
      setFlowState("brief");
    }
  }

  // ── Step 4 → editor ───────────────────────────────────────────────────────

  function handleApprovePages() {
    router.push("/outline");
  }

  // ── One-click ──────────────────────────────────────────────────────────────

  async function handleOneClick() {
    if (!token) { toast.error("Please sign in first"); return; }
    if (prompt.trim().length < 10) { toast.error("Tell us a bit more about your story"); return; }
    setOneClickRunning(true); setOneClickStage("writing"); setOneClickProgress({ done: 0, total: 0 });
    try {
      const savedDraft = await api.books.createDraft(token, { raw_prompt: prompt, age_range: age, tone: tone.length > 0 ? tone : ["Whimsical"], safety_mode: safety, page_count: pageCount, model_provider: modelProvider, model_name: modelName });
      setBook(savedDraft);
      const generated = await api.books.generate(token, savedDraft.id, style);
      setBook(generated);
      setOneClickStage("characters"); setOneClickProgress({ done: 0, total: 0 });
      const withChars = await api.books.generateCharacterSheets(token, generated.id);
      setBook(withChars);
      setOneClickStage("illustrating");
      const pages = [...withChars.pages].sort((a, b) => a.order - b.order);
      setOneClickProgress({ done: 0, total: pages.length });
      let cur = withChars;
      for (let i = 0; i < pages.length; i++) {
        const u = await api.books.illustratePage(token, withChars.id, pages[i].id);
        setBook(u); cur = u; setOneClickProgress({ done: i + 1, total: pages.length });
      }
      setOneClickStage("narrating");
      const textPages = [...cur.pages].sort((a, b) => a.order - b.order).filter((p) => p.text);
      setOneClickProgress({ done: 0, total: textPages.length });
      for (let i = 0; i < textPages.length; i++) {
        const u = await api.books.narratePage(token, cur.id, textPages[i].id);
        setBook(u); cur = u; setOneClickProgress({ done: i + 1, total: textPages.length });
      }
      setOneClickStage("done"); setOneClickBook(cur);
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

  const writingMessage = useWritingMessages(activeBrief);

  const sortedPages = currentBook
    ? [...currentBook.pages].sort((a, b) => a.order - b.order)
    : [];

  return (
    <>
      {oneClickRunning && (
        <OneClickOverlay stage={oneClickStage} progress={oneClickProgress} book={oneClickBook} onView={() => router.push("/reader")} />
      )}

      <main className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b-[2.5px] border-foreground bg-background px-6 py-3">
          <StepBar current={flowState} />
          {flowState !== "input" && (
            <button
              onClick={() => {
                if (flowState === "pages") setFlowState("pages");
                else if (flowState === "brief" || flowState === "writing") setFlowState("enhanced");
                else setFlowState("input");
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
            >
              <ArrowLeft className="h-3 w-3" strokeWidth={3} />
              {flowState === "pages" ? "Edit brief"
               : flowState === "brief" ? "Edit concept"
               : flowState === "enhanced" || flowState === "enhancing" ? "Edit prompt"
               : "Edit"}
            </button>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left pane */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">

                {/* ── INPUT ── */}
                {flowState === "input" && (
                  <motion.div key="input" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}
                    className="flex flex-col min-h-full px-6 py-8 md:px-10 md:py-10">
                    <h1 className="font-display text-4xl font-black md:text-5xl leading-tight">What&apos;s your story about?</h1>
                    <p className="mt-2 text-muted-foreground">One sentence is enough — we&apos;ll build the rest.</p>

                    <div className="relative mt-6">
                      <textarea value={prompt} onChange={(e) => setPrompt(truncateToWords(e.target.value, PROMPT_MAX_WORDS))} rows={7}
                        placeholder="A brave little fox who learns to share…"
                        className="w-full resize-none rounded-2xl bg-card p-5 pb-10 text-lg outline-none chunky-border focus:ring-4 focus:ring-primary/30" />
                      <div className="absolute bottom-3 right-4 flex items-center gap-2">
                        <span className={`text-xs font-bold tabular-nums transition-colors ${wordCount(prompt) >= PROMPT_MAX_WORDS ? "text-destructive" : wordCount(prompt) >= PROMPT_MAX_WORDS * 0.85 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {wordCount(prompt)} / {PROMPT_MAX_WORDS} words
                        </span>
                        {prompt.trim().length > 0 && <span className="text-xs text-muted-foreground/50">· {prompt.trim().length} chars</span>}
                      </div>
                    </div>

                    {/* ── Brainstorm panel ────────────────────────────── */}
                    <div className="mt-5">
                      <button
                        onClick={() => brainstormSeeds.length > 0 ? setBrainstormOpen((o) => !o) : handleBrainstorm()}
                        disabled={brainstormLoading}
                        className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0"
                      >
                        <div className="flex items-center gap-2 font-extrabold text-sm">
                          <Lightbulb className="h-4 w-4 text-amber-500" strokeWidth={2.5} />
                          {brainstormLoading ? "Generating ideas…" : "Need inspiration? Brainstorm ideas"}
                        </div>
                        {brainstormLoading
                          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          : brainstormSeeds.length > 0
                            ? <ChevronDown className={`h-4 w-4 transition-transform ${brainstormOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
                            : <Sparkles className="h-4 w-4 text-muted-foreground" strokeWidth={2.5} />
                        }
                      </button>
                      <AnimatePresence>
                        {brainstormOpen && brainstormSeeds.length > 0 && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                            <div className="mt-2 space-y-1.5">
                              {brainstormSeeds.map((seed, i) => (
                                <button key={i} onClick={() => { setPrompt(seed.hook); setBrainstormOpen(false); }}
                                  className="w-full text-left rounded-xl bg-card px-4 py-3 chunky-border hover:bg-accent/30 hover:-translate-y-0.5 transition-all group">
                                  <p className="text-xs font-extrabold text-primary mb-0.5">{seed.title}</p>
                                  <p className="text-sm font-semibold text-foreground/80 leading-snug">{seed.hook}</p>
                                </button>
                              ))}
                              <button onClick={handleBrainstorm} disabled={brainstormLoading}
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-card px-4 py-2 text-xs font-extrabold chunky-border text-muted-foreground hover:-translate-y-0.5 transition-transform disabled:opacity-50">
                                <RefreshCw className="h-3 w-3" strokeWidth={2.5} /> Generate new ideas
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="mt-6">
                      <button onClick={handleExpandPrompt} disabled={prompt.trim().length < 3}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0">
                        <Wand2 className="h-5 w-5" strokeWidth={2.5} /> Enhance my story →
                      </button>
                      <p className="mt-2 text-center text-xs text-muted-foreground">AI expands your idea into a full concept — review it, then generate the brief.</p>
                    </div>

                    {/* Mobile settings */}
                    <div className="mt-6 lg:hidden">
                      <button onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 font-extrabold chunky-border">
                        <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} /> Story settings</div>
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
                  </motion.div>
                )}

                {/* ── ENHANCING / ENHANCED ── */}
                {(flowState === "enhancing" || flowState === "enhanced") && (
                  <motion.div key="enhanced" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.22 }}
                    className="flex flex-col min-h-full px-6 py-8 md:px-10 md:py-10">

                    <div className="mb-2">
                      <h1 className="font-display text-3xl font-black md:text-4xl">Your story concept</h1>
                      <p className="mt-1 text-sm text-muted-foreground">AI expanded your idea — review it, then generate your brief.</p>
                    </div>

                    {/* Original prompt pill */}
                    <div className="mb-5 rounded-xl bg-muted/60 px-4 py-2.5 chunky-border">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-0.5">Your idea</p>
                      <p className="text-sm font-semibold text-foreground/80">{prompt}</p>
                    </div>

                    <EnhancedPromptReview
                      expanded={expandedPrompt}
                      loading={expandLoading}
                      onRegenerate={handleExpandPrompt}
                      onApprove={handleGenerateBrief}
                    />

                    {/* Mobile: locked settings */}
                    <div className="mt-6 lg:hidden">
                      <button onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 font-extrabold chunky-border">
                        <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} /> Settings used</div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
                      </button>
                      <AnimatePresence>
                        {settingsOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                            <div className="mt-3 rounded-2xl bg-card p-4 chunky-border">
                              <LockedSettingsSummary age={age} tone={tone} style={style} pageCount={pageCount} safety={safety} modelName={modelName} modelProvider={modelProvider} onEdit={() => { setFlowState("input"); setSettingsOpen(false); }} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}

                {/* ── BRIEF ── */}
                {flowState === "brief" && (
                  <motion.div key="brief" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.22 }}
                    className="flex flex-col min-h-full px-6 py-8 md:px-10 md:py-10">

                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h1 className="font-display text-3xl font-black md:text-4xl">Story brief</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Review, edit, or regenerate any field — then write the pages.</p>
                      </div>
                      {!briefLoading && activeBrief && (
                        <button onClick={() => { setActiveBrief(null); setBriefLoading(true); api.books.generateBrief(token!, briefParams).then(setActiveBrief).catch((e) => toast.error(e.message ?? "Failed")).finally(() => setBriefLoading(false)); }}
                          disabled={briefLoading}
                          className="shrink-0 flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-extrabold chunky-border hover:-translate-y-0.5 transition-transform disabled:opacity-50">
                          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} /> Regenerate all
                        </button>
                      )}
                    </div>

                    {/* Prompt pill */}
                    <div className="mb-5 rounded-xl bg-muted/60 px-4 py-2.5 chunky-border">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-0.5">Your prompt</p>
                      <p className="text-sm font-semibold text-foreground/80">{prompt}</p>
                    </div>

                    {briefLoading ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
                        <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-primary chunky-border chunky-shadow">
                          <Sparkles className="h-7 w-7 text-primary-foreground" strokeWidth={1.5} />
                          <span className="absolute -right-1.5 -top-1.5 h-4 w-4 animate-spin rounded-full border-[3px] border-foreground border-t-transparent" />
                        </div>
                        <div className="text-center">
                          <p className="font-display text-xl font-black">Building your brief…</p>
                          <p className="mt-1 text-sm text-muted-foreground">Crafting title, arc, characters &amp; themes</p>
                        </div>
                      </div>
                    ) : activeBrief ? (
                      <div className="space-y-3">
                        {/* Title */}
                        <EditableField label="Title" value={activeBrief.title}
                          onSave={(v) => updateBriefField("title", v)}
                          onRegenerate={() => regenerateField("title")} regenerating={regenField === "title"} />

                        {/* Description */}
                        <EditableField label="Story" value={activeBrief.description} multiline
                          onSave={(v) => updateBriefField("description", v)}
                          onRegenerate={() => regenerateField("description")} regenerating={regenField === "description"} />

                        {/* Lesson */}
                        <EditableField label="Lesson / Moral" value={activeBrief.lesson}
                          onSave={(v) => updateBriefField("lesson", v)}
                          onRegenerate={() => regenerateField("lesson")} regenerating={regenField === "lesson"} />

                        {/* Characters */}
                        {activeBrief.characters_intro?.length > 0 && (
                          <div className="rounded-2xl bg-background p-4 chunky-border">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
                              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Characters</span>
                            </div>
                            <div className="space-y-1.5">
                              {activeBrief.characters_intro.map((c, i) => (
                                <div key={i} className="flex items-start gap-2 rounded-xl bg-card px-3 py-2 chunky-border">
                                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">{i + 1}</span>
                                  <p className="text-sm font-semibold leading-snug">{c}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Themes */}
                        {activeBrief.themes?.length > 0 && (
                          <div className="rounded-2xl bg-background p-4 chunky-border">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
                              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Themes</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {activeBrief.themes.map((t) => <span key={t} className="rounded-full bg-card px-3 py-1 text-xs font-bold chunky-border">{t}</span>)}
                            </div>
                          </div>
                        )}

                        {/* Story arc */}
                        {activeBrief.arc?.length > 0 && (
                          <div className="rounded-2xl bg-background p-4 chunky-border">
                            <div className="flex items-center gap-1.5 mb-3">
                              <Map className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
                              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Story arc</span>
                            </div>
                            <div className="space-y-2">
                              {activeBrief.arc.map((stage, i) => (
                                <div key={i} className="flex gap-3 items-start">
                                  <div className="flex flex-col items-center shrink-0">
                                    <div className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground chunky-border">{i + 1}</div>
                                    {i < activeBrief.arc.length - 1 && <div className="w-0.5 flex-1 min-h-[12px] bg-foreground/20 mt-1" />}
                                  </div>
                                  <div className="pb-2">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-extrabold">{stage.name}</p>
                                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{stage.page_span} pages</span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground font-semibold">{stage.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* CTA */}
                        <div className="pt-2">
                          <button onClick={handleWritePages}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform">
                            <FileText className="h-5 w-5" strokeWidth={2} /> Write the pages →
                          </button>
                          <p className="mt-2 text-center text-xs text-muted-foreground">AI writes every page — you&apos;ll review &amp; edit before anything is illustrated.</p>
                        </div>

                        {/* Mobile: locked settings summary */}
                        <div className="lg:hidden mt-2">
                          <button onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 font-extrabold chunky-border">
                            <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} /> Settings used</div>
                            <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
                          </button>
                          <AnimatePresence>
                            {settingsOpen && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                                <div className="mt-3 rounded-2xl bg-card p-4 chunky-border">
                                  <LockedSettingsSummary age={age} tone={tone} style={style} pageCount={pageCount} safety={safety} modelName={modelName} modelProvider={modelProvider} onEdit={() => { setFlowState("input"); setSettingsOpen(false); }} />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                )}

                {/* ── WRITING ── */}
                {flowState === "writing" && (
                  <motion.div key="writing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-full items-center justify-center px-6 py-10">
                    <div className="flex flex-col items-center gap-6 text-center max-w-sm">
                      <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
                        <FileText className="h-9 w-9 text-primary-foreground" strokeWidth={1.5} />
                        <span className="absolute -right-2 -top-2 h-5 w-5 animate-spin rounded-full border-[3px] border-foreground border-t-transparent" />
                      </div>
                      <div>
                        <h2 className="font-display text-3xl font-black">Writing your pages…</h2>
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={writingMessage}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.35 }}
                            className="mt-2 text-sm font-semibold text-muted-foreground min-h-[1.25rem]"
                          >
                            {writingMessage}
                          </motion.p>
                        </AnimatePresence>
                      </div>
                      {activeBrief && (
                        <div className="rounded-2xl bg-card px-4 py-3 chunky-border text-left w-full">
                          <p className="font-display text-base font-black">{activeBrief.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground font-semibold line-clamp-2">{activeBrief.description}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ── PAGES REVIEW ── */}
                {flowState === "pages" && currentBook && (
                  <motion.div key="pages" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
                    className="flex flex-col min-h-full px-6 py-8 md:px-10 md:py-10">

                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div>
                        <h1 className="font-display text-3xl font-black md:text-4xl">Review your pages</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Edit or regenerate any page before illustrating. <span className="font-bold">{sortedPages.length} pages</span> generated.
                        </p>
                      </div>
                      <button
                        onClick={handleWritePages}
                        className="shrink-0 flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
                        title="Regenerate all pages"
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} /> Rewrite all
                      </button>
                    </div>

                    {/* Page cards */}
                    <div className="space-y-3">
                      {sortedPages.map((page) => (
                        <PageReviewCard
                          key={page.id}
                          page={page}
                          bookId={currentBook.id}
                          token={token!}
                          onUpdate={(updated) => { setCurrentBook(updated); setBook(updated); }}
                        />
                      ))}
                    </div>

                    {/* Approve CTA */}
                    <div className="mt-6 space-y-3">
                      <button onClick={handleApprovePages}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform">
                        <BookOpen className="h-5 w-5" strokeWidth={2} /> Looks good — go to editor →
                      </button>
                      <p className="text-center text-xs text-muted-foreground">Next: add illustrations, narration, and export your book.</p>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>

          {/* ── Right pane ─────────────────────────────────────────────────── */}
          <div className="hidden lg:flex w-[360px] xl:w-[400px] shrink-0 flex-col overflow-y-auto border-l-[2.5px] border-foreground bg-card/40">
            <div className="sticky top-0 z-10 border-b-[2px] border-foreground bg-card/90 backdrop-blur px-5 py-3.5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} />
                <span className="font-display text-sm font-black uppercase tracking-wide">
                  {flowState === "input" ? "Story settings"
                    : flowState === "pages" ? "Brief & settings"
                    : "Settings locked"}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {flowState === "pages" && activeBrief ? (
                <BriefSummaryPanel
                  brief={activeBrief} age={age} pageCount={pageCount}
                  style={style} modelName={modelName} modelProvider={modelProvider}
                />
              ) : flowState === "input" ? (
                <OptionsPanel {...optionsProps} />
              ) : (
                <LockedSettingsSummary
                  age={age} tone={tone} style={style} pageCount={pageCount}
                  safety={safety} modelName={modelName} modelProvider={modelProvider}
                  onEdit={() => setFlowState("input")}
                />
              )}
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
