import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, ArrowLeft, Sparkles, Shield } from "lucide-react";
import page1 from "@/assets/page1.jpg";
import page2 from "@/assets/page2.jpg";
import page3 from "@/assets/page3.jpg";
import cover from "@/assets/cover.jpg";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create your storybook — Storybook Studio" },
      { name: "description", content: "Turn one prompt into a full children's book in 4 quick steps." },
    ],
  }),
  component: CreatePage,
});

const examples = [
  "A brave little fox who learns to share",
  "Two best-friend robots who lose their colors",
  "A shy dragon who runs a tiny tea shop",
];

const styles = [
  { id: "watercolor", label: "Watercolor", img: cover },
  { id: "crayon", label: "Crayon", img: page1 },
  { id: "flat", label: "Flat", img: page2 },
  { id: "papercut", label: "Papercut", img: page3 },
];

function CreatePage() {
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [age, setAge] = useState("3-5");
  const [tone, setTone] = useState<string[]>(["Funny"]);
  const [style, setStyle] = useState("watercolor");
  const [safety, setSafety] = useState(true);
  const navigate = useNavigate();

  const next = () => (step < 3 ? setStep(step + 1) : navigate({ to: "/outline" }));
  const prev = () => step > 0 && setStep(step - 1);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {/* Progress dots */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-3 rounded-full chunky-border transition-all ${
              i === step ? "w-10 bg-primary" : i < step ? "w-3 bg-foreground" : "w-3 bg-card"
            }`}
          />
        ))}
      </div>

      <div className="rounded-3xl bg-card p-8 chunky-border chunky-shadow md:p-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {step === 0 && (
              <div>
                <h1 className="font-display text-4xl font-black">What's your story about?</h1>
                <p className="mt-2 text-muted-foreground">One line is enough — we'll build the rest.</p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="A brave little fox who learns to share…"
                  className="mt-6 w-full resize-none rounded-2xl bg-background p-5 text-lg outline-none chunky-border focus:ring-4 focus:ring-primary/30"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {examples.map((ex) => (
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

            {step === 1 && (
              <div>
                <h1 className="font-display text-4xl font-black">Your story brief</h1>
                <p className="mt-2 text-muted-foreground">We turned your idea into a brief. Tweak anything.</p>
                <div className="mt-6 grid gap-4">
                  {[
                    { label: "Title", value: "The Brave Little Fox" },
                    { label: "Setting", value: "A bright forest in early autumn" },
                    { label: "Main character", value: "Pip, a curious orange fox cub" },
                    { label: "Lesson", value: "Sharing makes the world bigger, not smaller." },
                  ].map((f) => (
                    <label key={f.label} className="block">
                      <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        {f.label}
                      </div>
                      <input
                        defaultValue={f.value}
                        className="w-full rounded-xl bg-background px-4 py-3 font-semibold chunky-border outline-none focus:ring-4 focus:ring-primary/30"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h1 className="font-display text-4xl font-black">Who's it for?</h1>
                <p className="mt-2 text-muted-foreground">Reading level, tone, and safety guardrails.</p>

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
                  <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Tone</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["Funny", "Calm", "Adventurous", "Cozy", "Silly"].map((t) => {
                      const on = tone.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() =>
                            setTone(on ? tone.filter((x) => x !== t) : [...tone, t])
                          }
                          className={`rounded-full px-4 py-2 text-sm font-bold chunky-border ${
                            on ? "bg-accent text-accent-foreground chunky-shadow-sm" : "bg-background"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
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
              </div>
            )}

            {step === 3 && (
              <div>
                <h1 className="font-display text-4xl font-black">Pick your art style</h1>
                <p className="mt-2 text-muted-foreground">All pages will share this look.</p>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  {styles.map((s) => {
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
                          <img src={s.img} alt={s.label} loading="lazy" className="h-full w-full object-cover" />
                        </div>
                        <div className="border-t-[2.5px] border-foreground px-3 py-2 font-extrabold">
                          {s.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={prev}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-background px-4 py-2 text-sm font-extrabold chunky-border disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={3} /> Back
          </button>
          <button
            onClick={next}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
          >
            {step === 3 ? (
              <>
                <Sparkles className="h-4 w-4" strokeWidth={3} /> Generate outline
              </>
            ) : (
              <>
                Next <ArrowRight className="h-4 w-4" strokeWidth={3} />
              </>
            )}
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have a story?{" "}
        <Link to="/editor" className="font-extrabold underline-offset-4 hover:underline">
          Open the editor →
        </Link>
      </p>
    </main>
  );
}