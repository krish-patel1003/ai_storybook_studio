"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
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
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBook } from "@/lib/book-store";
import { api, type BookOut, type BriefOut, type ProviderInfo } from "@/lib/api";
import { toast } from "sonner";

const EXAMPLES = [
  "A brave little fox who learns to share",
  "Two best-friend robots who lose their colors",
  "A shy dragon who runs a tiny tea shop",
];

const STYLES = [
  { id: "watercolor", label: "Watercolor", img: "/assets/cover.jpg" },
  { id: "crayon", label: "Crayon", img: "/assets/page1.jpg" },
  { id: "flat", label: "Flat", img: "/assets/page2.jpg" },
  { id: "papercut", label: "Papercut", img: "/assets/page3.jpg" },
];

const TONES = [
  "Funny", "Calm", "Adventurous", "Cozy", "Silly",
  "Whimsical", "Magical", "Spooky", "Heartwarming",
  "Educational", "Mysterious", "Epic",
];

const PAGE_COUNT_OPTIONS = [6, 8, 10, 12, 15, 20];

const GENERATION_STAGES = [
  "Enhancing your idea…",
  "Building characters…",
  "Writing story beats…",
  "Writing pages…",
  "Polishing the prose…",
];

// ── Standard generating overlay (existing wizard) ─────────────────────────────

function GeneratingOverlay() {
  const [stageIdx, setStageIdx] = useState(0);
  const [progress, setProgress] = useState(4);

  useEffect(() => {
    const stageMs = [8000, 15000, 20000, 60000, 20000];
    let total = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    stageMs.forEach((ms, i) => {
      total += ms;
      timers.push(
        setTimeout(() => {
          if (i + 1 < GENERATION_STAGES.length) setStageIdx(i + 1);
        }, total - ms + 1000)
      );
    });

    const tick = setInterval(() => {
      setProgress((p) => Math.min(p + 0.5, 94));
    }, 600);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(tick);
    };
  }, []);

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
          <div className="mb-3 h-3 overflow-hidden rounded-full bg-muted chunky-border">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={stageIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="text-sm font-bold text-muted-foreground"
            >
              {GENERATION_STAGES[stageIdx]}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="mt-2 flex gap-2">
          {GENERATION_STAGES.map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-all ${
                i <= stageIdx ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── One-click overlay ─────────────────────────────────────────────────────────

type OneClickStage = "writing" | "characters" | "illustrating" | "narrating" | "done";

const ONE_CLICK_STAGES: { id: OneClickStage; icon: React.ReactNode; label: string }[] = [
  { id: "writing",     icon: <Sparkles className="h-4 w-4" />,  label: "Writing"     },
  { id: "characters",  icon: <Users className="h-4 w-4" />,     label: "Characters"  },
  { id: "illustrating",icon: <ImageIcon className="h-4 w-4" />, label: "Illustrating"},
  { id: "narrating",   icon: <Mic className="h-4 w-4" />,       label: "Narrating"   },
];

function OneClickOverlay({
  stage,
  progress,
  book,
  onView,
}: {
  stage: OneClickStage;
  progress: { done: number; total: number };
  book: BookOut | null;
  onView: () => void;
}) {
  const stageIdx = ONE_CLICK_STAGES.findIndex((s) => s.id === stage);
  const isDone = stage === "done";

  const overallPct = isDone
    ? 100
    : stageIdx === 0
    ? 10
    : stageIdx === 1
    ? 25
    : stageIdx === 2
    ? 40 + (progress.total > 0 ? (progress.done / progress.total) * 30 : 0)
    : 70 + (progress.total > 0 ? (progress.done / progress.total) * 27 : 0);

  const statusLabel =
    stage === "writing"
      ? "Writing your story…"
      : stage === "characters"
      ? "Designing character sheets…"
      : stage === "illustrating"
      ? `Illustrating pages… ${progress.total > 0 ? `(${progress.done} / ${progress.total})` : ""}`
      : stage === "narrating"
      ? `Adding narration… ${progress.total > 0 ? `(${progress.done} / ${progress.total})` : ""}`
      : "Your book is ready!";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur px-6">
      <AnimatePresence mode="wait">
        {isDone ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-6 text-center"
          >
            <div className="grid h-28 w-28 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
              <BookOpen className="h-12 w-12 text-primary-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="font-display text-4xl font-black">Your book is ready!</h2>
              {book && (
                <p className="mt-2 text-lg font-bold text-muted-foreground">
                  {book.brief?.title ?? book.title}
                </p>
              )}
            </div>
            <button
              onClick={onView}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform"
            >
              <BookOpen className="h-5 w-5" strokeWidth={2.5} /> Read your book
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="progress"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex w-full max-w-sm flex-col items-center gap-7 text-center"
          >
            {/* Spinning icon */}
            <div className="relative grid h-24 w-24 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
              <Wand2 className="h-10 w-10 text-primary-foreground" strokeWidth={2} />
              <span className="absolute -right-2 -top-2 h-5 w-5 animate-spin rounded-full border-[3px] border-foreground border-t-transparent" />
            </div>

            <div>
              <h2 className="font-display text-3xl font-black">Making your book…</h2>
              <AnimatePresence mode="wait">
                <motion.p
                  key={statusLabel}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="mt-2 text-sm font-bold text-muted-foreground"
                >
                  {statusLabel}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Overall progress bar */}
            <div className="w-full">
              <div className="h-3 overflow-hidden rounded-full bg-muted chunky-border">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  animate={{ width: `${overallPct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Stage pills */}
            <div className="flex items-center gap-3">
              {ONE_CLICK_STAGES.map((s, i) => {
                const done = i < stageIdx;
                const active = i === stageIdx;
                return (
                  <div key={s.id} className="flex flex-col items-center gap-1.5">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full chunky-border transition-all ${
                        done
                          ? "bg-primary text-primary-foreground"
                          : active
                          ? "bg-primary text-primary-foreground scale-110 chunky-shadow"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : s.icon}
                    </div>
                    <span className={`text-xs font-bold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              This takes a few minutes — sit back and relax ✨
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Brief card ────────────────────────────────────────────────────────────────

function BriefCard({
  brief,
  selected,
  onSelect,
}: {
  brief: BriefOut;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl p-4 text-left transition-all chunky-border ${
        selected
          ? "bg-primary text-primary-foreground chunky-shadow -translate-y-0.5"
          : "bg-background hover:bg-highlight"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-display text-lg font-black leading-tight">{brief.title}</div>
        {selected && (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-foreground">
            <Check className="h-3 w-3 text-primary" strokeWidth={3} />
          </span>
        )}
      </div>
      <p className={`mt-1 text-sm leading-snug ${selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        {brief.logline}
      </p>
      <div className={`mt-2 text-xs font-bold ${selected ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
        {brief.narrative_structure}
      </div>
    </button>
  );
}

// ── Brief edit panel ──────────────────────────────────────────────────────────

function BriefEditor({
  brief,
  onChange,
}: {
  brief: BriefOut;
  onChange: (updated: BriefOut) => void;
}) {
  const fields: { key: keyof BriefOut; label: string; multiline?: boolean }[] = [
    { key: "title", label: "Title" },
    { key: "logline", label: "Logline", multiline: true },
    { key: "central_conflict", label: "Central conflict", multiline: true },
    { key: "moral", label: "Moral" },
    { key: "world", label: "World / Setting", multiline: true },
  ];

  return (
    <div className="mt-4 grid gap-3 rounded-2xl bg-card p-4 chunky-border">
      <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
        Edit brief
      </p>
      {fields.map(({ key, label, multiline }) => (
        <label key={key} className="block">
          <div className="mb-1 text-xs font-bold text-muted-foreground">{label}</div>
          {multiline ? (
            <textarea
              rows={2}
              value={brief[key] as string}
              onChange={(e) => onChange({ ...brief, [key]: e.target.value })}
              className="w-full resize-none rounded-xl bg-background px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30"
            />
          ) : (
            <input
              value={brief[key] as string}
              onChange={(e) => onChange({ ...brief, [key]: e.target.value })}
              className="w-full rounded-xl bg-background px-3 py-2 text-sm font-semibold chunky-border outline-none focus:ring-2 focus:ring-primary/30"
            />
          )}
        </label>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();
  const { token } = useAuth();
  const { setBook } = useBook();

  // Wizard state
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [age, setAge] = useState("3-5");
  const [tone, setTone] = useState<string[]>(["Funny"]);
  const [safety, setSafety] = useState(true);
  const [pageCount, setPageCount] = useState(10);
  const [style, setStyle] = useState("watercolor");
  const [modelProvider, setModelProvider] = useState("gemini");
  const [modelName, setModelName] = useState("gemini-3.5-flash");

  // Model discovery
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Brief generation
  const [briefs, setBriefs] = useState<BriefOut[]>([]);
  const [briefsLoading, setBriefsLoading] = useState(false);
  const [selectedBriefIdx, setSelectedBriefIdx] = useState(0);
  const [editedBrief, setEditedBrief] = useState<BriefOut | null>(null);

  // Draft & generation
  const [draft, setDraft] = useState<BookOut | null>(null);
  const [generating, setGenerating] = useState(false);

  // One-click state
  const [oneClickRunning, setOneClickRunning] = useState(false);
  const [oneClickStage, setOneClickStage] = useState<OneClickStage>("writing");
  const [oneClickProgress, setOneClickProgress] = useState({ done: 0, total: 0 });
  const [oneClickBook, setOneClickBook] = useState<BookOut | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Clean up SSE connection on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  useEffect(() => {
    if (!token) return;
    setModelsLoading(true);
    api.books.models(token)
      .then((d) => {
        setProviders(d.providers);
        // Auto-select first available provider + model
        const first = d.providers.find((p) => p.available);
        if (first) {
          setModelProvider(first.id);
          if (first.models[0]) setModelName(first.models[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, [token]);

  const activeBrief = editedBrief ?? briefs[selectedBriefIdx] ?? null;

  async function fetchBriefs(existingDraft?: BookOut) {
    if (!token) { toast.error("Please sign in first"); return false; }
    setBriefsLoading(true);
    setBriefs([]);
    setEditedBrief(null);
    setSelectedBriefIdx(0);
    try {
      if (!existingDraft && !draft) {
        const saved = await api.books.createDraft(token, {
          raw_prompt: prompt,
          age_range: age,
          tone,
          safety_mode: safety,
          page_count: pageCount,
          model_provider: modelProvider,
          model_name: modelName,
        });
        setDraft(saved);
        setBook(saved);
      }
      const res = await api.books.generateBriefs(token, {
        raw_prompt: prompt,
        age_range: age,
        tone,
        safety_mode: safety,
        page_count: pageCount,
        model_provider: modelProvider,
        model_name: modelName,
      });
      setBriefs(res.briefs);
      // Auto-select first brief
      setSelectedBriefIdx(0);
      if (res.briefs[0]) setEditedBrief(res.briefs[0]);
      return true;
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate briefs");
      return false;
    } finally {
      setBriefsLoading(false);
    }
  }

  async function handleNext() {
    if (step === 0) {
      if (prompt.trim().length < 10) { toast.error("Tell us a bit more about your story"); return; }
      setStep(1);
      return;
    }
    if (step === 1) {
      setStep(2);
      await fetchBriefs();
      return;
    }
    if (step === 2) {
      if (!activeBrief) { toast.error("Pick a brief first"); return; }
      setStep(3);
      return;
    }
    if (step === 3) await generateBook();
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
          raw_prompt: prompt,
          age_range: age,
          tone,
          art_style: style,
          safety_mode: safety,
          page_count: pageCount,
          model_provider: modelProvider,
          model_name: modelName,
        });
      }
      setBook(book);
      router.push("/outline");
    } catch (err: any) {
      toast.error(err.message ?? "Generation failed. Please try again.");
      setGenerating(false);
    }
  }

  // ── One-click handler (SSE-driven) ─────────────────────────────────────────

  async function handleOneClick() {
    if (!token) { toast.error("Please sign in first"); return; }
    if (prompt.trim().length < 10) { toast.error("Tell us a bit more about your story"); return; }

    setOneClickRunning(true);
    setOneClickStage("writing");
    setOneClickProgress({ done: 0, total: 0 });

    // 1. Create the draft record (fast POST — gives us a book_id for the SSE URL)
    let savedDraft: BookOut;
    try {
      savedDraft = await api.books.createDraft(token, {
        raw_prompt: prompt,
        age_range: age,
        tone: tone.length > 0 ? tone : ["Whimsical"],
        safety_mode: safety,
        page_count: pageCount,
        model_provider: modelProvider,
        model_name: modelName,
      });
      setBook(savedDraft);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start book creation.");
      setOneClickRunning(false);
      return;
    }

    // 2. Open SSE stream — all heavy generation happens server-side
    const artStyle = "watercolor";
    const es = api.books.connectGenerateStream(token, savedDraft.id, artStyle, {
      onStageChange: (data) => {
        setOneClickStage(data.stage as OneClickStage);
        setOneClickProgress({ done: 0, total: data.page_total ?? 0 });
      },
      onPageDone: (data) => {
        setOneClickProgress((prev) => ({ ...prev, done: data.done }));
      },
      onBookReady: (data) => {
        setBook(data.book);
        setOneClickStage("done");
        setOneClickBook(data.book);
        esRef.current = null;
      },
      onError: (data) => {
        toast.error(data.message ?? "Something went wrong. Please try again.");
        setOneClickRunning(false);
        esRef.current = null;
      },
    });

    esRef.current = es;
  }

  function handleViewBook() {
    router.push("/reader");
  }

  function handlePrev() {
    if (step > 0) setStep(step - 1);
  }

  function handleSelectBrief(idx: number) {
    setSelectedBriefIdx(idx);
    setEditedBrief(briefs[idx]);
  }

  const canNext =
    (step === 0 && prompt.trim().length >= 10) ||
    step === 1 ||
    (step === 2 && (briefs.length > 0 || briefsLoading)) ||
    step === 3;

  return (
    <>
      {generating && <GeneratingOverlay />}
      {oneClickRunning && (
        <OneClickOverlay
          stage={oneClickStage}
          progress={oneClickProgress}
          book={oneClickBook}
          onView={handleViewBook}
        />
      )}

      <main className="flex h-[calc(100vh-4rem)] flex-col px-4 py-5 md:px-8 md:py-6">
        {/* Progress dots */}
        <div className="mb-4 flex shrink-0 items-center justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-3 rounded-full chunky-border transition-all duration-300 ${
                i === step ? "w-10 bg-primary" : i < step ? "w-3 bg-foreground" : "w-3 bg-card"
              }`}
            />
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-3xl bg-card chunky-border chunky-shadow">
          <div className="min-h-0 flex-1 overflow-y-auto p-8 md:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
              >
                {/* ── Step 0: Prompt ── */}
                {step === 0 && (
                  <div>
                    <h1 className="font-display text-4xl font-black md:text-5xl">
                      What&apos;s your story about?
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                      One line is enough — we&apos;ll build the rest.
                    </p>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={5}
                      placeholder="A brave little fox who learns to share…"
                      className="mt-6 w-full resize-none rounded-2xl bg-background p-5 text-lg outline-none chunky-border focus:ring-4 focus:ring-primary/30"
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      {EXAMPLES.map((ex) => (
                        <button
                          key={ex}
                          onClick={() => setPrompt(ex)}
                          className="rounded-full bg-highlight px-3 py-1.5 text-sm font-bold chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
                        >
                          ✦ {ex}
                        </button>
                      ))}
                    </div>

                  </div>
                )}

                {/* ── Step 1: Audience ── */}
                {step === 1 && (
                  <div>
                    <h1 className="font-display text-4xl font-black md:text-5xl">
                      Who&apos;s it for?
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                      Reading level, tone, and safety guardrails.
                    </p>

                    <div className="mt-6">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        Reading level
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {["3-5", "6-8", "9-11"].map((a) => (
                          <button
                            key={a}
                            onClick={() => setAge(a)}
                            className={`rounded-xl px-4 py-3 font-extrabold chunky-border ${
                              age === a
                                ? "bg-primary text-primary-foreground chunky-shadow-sm"
                                : "bg-background"
                            }`}
                          >
                            Ages {a}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        Tone
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {TONES.map((t) => {
                          const on = tone.includes(t);
                          return (
                            <button
                              key={t}
                              onClick={() =>
                                setTone(on ? tone.filter((x) => x !== t) : [...tone, t])
                              }
                              className={`rounded-full px-4 py-2 text-sm font-bold chunky-border ${
                                on
                                  ? "bg-accent text-accent-foreground chunky-shadow-sm"
                                  : "bg-background"
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2">
                        Page count
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {PAGE_COUNT_OPTIONS.map((n) => (
                          <button
                            key={n}
                            onClick={() => setPageCount(n)}
                            className={`rounded-xl px-4 py-2 text-sm font-extrabold chunky-border ${
                              pageCount === n
                                ? "bg-primary text-primary-foreground chunky-shadow-sm"
                                : "bg-background"
                            }`}
                          >
                            {n} pages
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => setSafety(!safety)}
                      className="mt-6 flex w-full items-center justify-between rounded-2xl bg-background p-4 chunky-border"
                    >
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5" strokeWidth={2.5} />
                        <div className="text-left">
                          <div className="font-extrabold">Safety filters</div>
                          <div className="text-xs text-muted-foreground">
                            Block scary themes, violence, and unkind language.
                          </div>
                        </div>
                      </div>
                      <span
                        className={`relative h-7 w-12 rounded-full chunky-border ${
                          safety ? "bg-accent" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-foreground transition-all ${
                            safety ? "left-6" : "left-0.5"
                          }`}
                        />
                      </span>
                    </button>

                    {/* AI model selector */}
                    <div className="mt-6">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2">
                        AI model
                      </div>
                      {modelsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Detecting models…
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(providers.length > 0
                            ? providers
                            : [
                                {
                                  id: "gemini",
                                  name: "Google Gemini",
                                  description: "Cloud-hosted · High quality",
                                  available: true,
                                  models: [
                                    { id: "gemini-3.5-flash", name: "Gemini Flash", description: "Fast & efficient", size: "cloud" },
                                    { id: "gemini-1.5-pro", name: "Gemini Pro", description: "Highest quality", size: "cloud" },
                                  ],
                                },
                              ]
                          ).map((provider) => (
                            <div key={provider.id}>
                              <div className="mb-1.5 flex items-center gap-2">
                                <span className="text-xs font-bold text-muted-foreground">
                                  {provider.name}
                                </span>
                                {!provider.available && (
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                                    not running
                                  </span>
                                )}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {provider.models.map((m) => {
                                  const active = modelProvider === provider.id && modelName === m.id;
                                  return (
                                    <button
                                      key={m.id}
                                      disabled={!provider.available}
                                      onClick={() => {
                                        setModelProvider(provider.id);
                                        setModelName(m.id);
                                      }}
                                      className={`flex items-start gap-3 rounded-xl p-3 text-left chunky-border transition-all disabled:opacity-40 ${
                                        active
                                          ? "bg-primary text-primary-foreground chunky-shadow-sm"
                                          : "bg-background hover:bg-highlight"
                                      }`}
                                    >
                                      <div className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                                        active ? "border-primary-foreground bg-primary-foreground" : "border-foreground/40"
                                      }`}>
                                        {active && <div className="h-2 w-2 rounded-full bg-primary" />}
                                      </div>
                                      <div>
                                        <div className="text-sm font-extrabold leading-tight">{m.name}</div>
                                        <div className={`text-xs mt-0.5 ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                          {m.description}
                                          {m.size && m.size !== "cloud" && (
                                            <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 py-0.5">
                                              {m.size}
                                            </span>
                                          )}
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

                    {/* ── One-click CTA ── */}
                    <div className="mt-8 rounded-2xl bg-primary/5 p-5 chunky-border">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary chunky-border">
                          <Wand2 className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
                        </div>
                        <div>
                          <p className="font-extrabold">Make it for me</p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            One click — writes, illustrates &amp; narrates your entire book automatically.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {[
                          { icon: <Sparkles className="h-3 w-3" />, label: "Story written by AI" },
                          { icon: <ImageIcon className="h-3 w-3" />, label: "Every page illustrated" },
                          { icon: <Mic className="h-3 w-3" />, label: "Full narration recorded" },
                        ].map(({ icon, label }) => (
                          <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold chunky-border">
                            {icon} {label}
                          </span>
                        ))}
                      </div>

                      <button
                        onClick={handleOneClick}
                        disabled={prompt.trim().length < 10}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0"
                      >
                        <Wand2 className="h-4 w-4" strokeWidth={2.5} />
                        Make my book — fully automatic
                      </button>

                      <p className="mt-3 text-center text-xs text-muted-foreground">
                        Uses your selections above · Watercolor art style
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Step 2: Brief options ── */}
                {step === 2 && (
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h1 className="font-display text-4xl font-black md:text-5xl">
                          Pick your brief
                        </h1>
                        <p className="mt-2 text-muted-foreground">
                          We generated 4 takes. Pick the one that feels right and edit it.
                        </p>
                      </div>
                      <button
                        onClick={() => fetchBriefs(draft ?? undefined)}
                        disabled={briefsLoading}
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-background px-4 py-2 text-sm font-extrabold chunky-border disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${briefsLoading ? "animate-spin" : ""}`}
                          strokeWidth={2.5}
                        />
                        Regenerate
                      </button>
                    </div>

                    {briefsLoading ? (
                      <div className="mt-10 flex flex-col items-center gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="font-bold text-muted-foreground">
                          Generating 4 story briefs…
                        </p>
                      </div>
                    ) : (
                      <div className="mt-6">
                        <div className="grid gap-3 md:grid-cols-2">
                          {briefs.map((b, i) => (
                            <BriefCard
                              key={i}
                              brief={b}
                              selected={selectedBriefIdx === i}
                              onSelect={() => handleSelectBrief(i)}
                            />
                          ))}
                        </div>
                        {activeBrief && (
                          <BriefEditor
                            brief={activeBrief}
                            onChange={setEditedBrief}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 3: Art style ── */}
                {step === 3 && (
                  <div>
                    <h1 className="font-display text-4xl font-black md:text-5xl">
                      Pick your art style
                    </h1>
                    <p className="mt-2 text-muted-foreground">All pages will share this look.</p>
                    <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                      {STYLES.map((s) => {
                        const on = style === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setStyle(s.id)}
                            className={`overflow-hidden rounded-2xl bg-background text-left chunky-border transition-transform ${
                              on ? "ring-4 ring-primary/40 -translate-y-1 chunky-shadow" : ""
                            }`}
                          >
                            <div className="aspect-[4/3] overflow-hidden bg-muted">
                              <img
                                src={s.img}
                                alt={s.label}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="border-t-[2.5px] border-foreground px-3 py-2 font-extrabold">
                              {s.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {activeBrief && (
                      <div className="mt-6 rounded-2xl bg-background p-4 chunky-border">
                        <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                          Your brief
                        </p>
                        <p className="mt-1 font-display text-xl font-black">{activeBrief.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{activeBrief.logline}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-muted-foreground">
                          <span>Ages {age}</span>
                          <span>·</span>
                          <span>{pageCount} pages</span>
                          <span>·</span>
                          <span className="capitalize">{style}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            {modelProvider === "ollama"
                              ? <><Cpu className="h-3 w-3" /> {modelName}</>
                              : <><Cloud className="h-3 w-3" /> {modelName}</>
                            }
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Nav buttons */}
          <div className="shrink-0 border-t-[2.5px] border-foreground px-8 py-5 md:px-10">
            <div className="flex items-center justify-between">
              <button
                onClick={handlePrev}
                disabled={step === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-background px-5 py-2.5 text-sm font-extrabold chunky-border disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={3} /> Back
              </button>

              <button
                onClick={handleNext}
                disabled={!canNext || briefsLoading}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0"
              >
                {step === 3 ? (
                  <><Sparkles className="h-4 w-4" strokeWidth={3} /> Generate book</>
                ) : step === 1 ? (
                  <>Next — generate briefs <ArrowRight className="h-4 w-4" strokeWidth={3} /></>
                ) : (
                  <>Next <ArrowRight className="h-4 w-4" strokeWidth={3} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
