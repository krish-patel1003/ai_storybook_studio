"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Sparkles, Wand2, Palette, BookMarked, ArrowRight, Star, Lock, BookOpen, Download } from "lucide-react";

const SAMPLE_BOOKS = [
  { img: "/assets/cover.jpg",  title: "The Brave Little Fox",    age: "Ages 3–5", pages: 10 },
  { img: "/assets/page1.jpg",  title: "Pip's Cozy Morning",      age: "Ages 3–5", pages: 8  },
  { img: "/assets/page2.jpg",  title: "Professor Hoot Knows",    age: "Ages 6–8", pages: 12 },
  { img: "/assets/page3.jpg",  title: "Berries by the Stream",   age: "Ages 3–5", pages: 10 },
];

const HOW_IT_WORKS = [
  {
    icon: Wand2, bg: "bg-primary", fg: "text-primary-foreground",
    title: "1. Describe your idea",
    desc: "One sentence. We expand it into a full story brief with characters, themes, and an arc — you approve every detail.",
  },
  {
    icon: Palette, bg: "bg-secondary", fg: "text-secondary-foreground",
    title: "2. Generate illustrations",
    desc: "Lock character designs once. Every page gets consistent, beautiful illustrations in the art style you choose.",
  },
  {
    icon: BookMarked, bg: "bg-accent", fg: "text-accent-foreground",
    title: "3. Publish anywhere",
    desc: "Share a reading link, download a print-ready PDF, or export KDP-formatted files for Amazon self-publishing.",
  },
];

const TRUST_POINTS = [
  { icon: Lock,     text: "Your story stays private by default"        },
  { icon: Star,     text: "Built for ages 3–11 with safety filters"    },
  { icon: Download, text: "Export PDF at any time — no lock-in"        },
  { icon: BookOpen, text: "Full KDP guide included with every book"    },
];

export default function HomePage() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:py-28 lg:gap-16">
          <div className="relative z-10 flex flex-col justify-center">
            <span className="mb-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-foreground chunky-border">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={3} /> Personalized children&apos;s books + KDP publishing
            </span>
            <h1 className="font-display text-5xl font-black leading-[0.93] md:text-6xl lg:text-7xl">
              Every child{" "}
              <span className="relative inline-block">
                <span className="relative z-10">deserves</span>
                <span className="absolute inset-x-0 bottom-1 h-4 -rotate-1 bg-highlight" aria-hidden />
              </span>{" "}
              a book made just for them.
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Type a one-line idea. In minutes you get a fully illustrated,
              narrated children&apos;s storybook — personalised for your child,
              ready to read online or publish on Amazon KDP.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {["AI-written story", "Consistent characters", "Print-ready PDF", "KDP export"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-bold chunky-border">
                  <span className="text-primary">✦</span> {t}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/create"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow transition-transform hover:-translate-y-1"
              >
                Create My First Book <ArrowRight className="h-5 w-5" strokeWidth={3} />
              </Link>
              <Link
                href="/read/sample"
                className="inline-flex items-center gap-2 rounded-full bg-card px-6 py-3.5 text-base font-extrabold text-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-1"
              >
                <BookOpen className="h-4 w-4" strokeWidth={2.5} /> View Sample Book
              </Link>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Free to start · No credit card required · Your stories stay private by default
            </p>
          </div>

          <div className="relative">
            <motion.div
              initial={{ y: 10, rotate: -2, opacity: 0 }}
              animate={{ y: 0, rotate: -2, opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="overflow-hidden rounded-3xl bg-card chunky-border chunky-shadow"
            >
              <img
                src="/assets/hero.jpg"
                alt="A fox, bunny and owl reading a glowing storybook"
                width={1280}
                height={960}
                className="h-auto w-full"
              />
            </motion.div>
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-6 top-10 hidden rotate-[-12deg] rounded-2xl bg-highlight px-4 py-2 font-display text-lg font-black chunky-border chunky-shadow-sm md:block"
            >
              ✦ Once upon a time…
            </motion.div>
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute -bottom-4 -right-2 hidden rotate-[8deg] rounded-2xl bg-secondary px-4 py-2 font-display text-lg font-black chunky-border chunky-shadow-sm md:block"
            >
              The end ✿
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Social proof bar ─────────────────────────────────────────────── */}
      <div className="border-y-[2.5px] border-foreground bg-foreground py-3 text-background overflow-hidden">
        <div className="flex animate-marquee-slow whitespace-nowrap gap-10 items-center">
          {[
            "Illustrated in seconds",
            "Consistent characters across every page",
            "Your child's name in the story",
            "Print-ready PDF",
            "KDP self-publishing guide included",
            "Narrated with AI voices",
            "Safe for ages 3–11",
            "No lock-in — export anytime",
          ].concat([
            "Illustrated in seconds",
            "Consistent characters across every page",
            "Your child's name in the story",
            "Print-ready PDF",
          ]).map((t, i) => (
            <span key={i} className="inline-flex items-center gap-3 text-sm font-extrabold">
              <span className="text-accent">✦</span> {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="bg-card border-b-[2.5px] border-foreground">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-black md:text-5xl">
              From idea to illustrated storybook in minutes
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              No design skills needed. No subscription to start. You stay in control at every step.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.title} className="rounded-3xl bg-background p-6 chunky-border chunky-shadow-sm">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${s.bg} chunky-border`}>
                  <s.icon className={`h-7 w-7 ${s.fg}`} strokeWidth={2.5} />
                </span>
                <h3 className="mt-4 font-display text-2xl font-black">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Personalisation callout ───────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="rounded-3xl bg-accent/20 p-8 chunky-border md:p-12 flex flex-col md:flex-row items-center gap-8">
          <div className="text-6xl shrink-0">👧🦊📚</div>
          <div>
            <h2 className="font-display text-3xl font-black md:text-4xl">
              Built around your child, not a template
            </h2>
            <p className="mt-3 text-muted-foreground max-w-lg">
              Create a child profile with their name, age, interests, and reading level.
              Every story is tailored to them — the vocabulary, the characters, the themes.
              The loading screen even shows a character that matches their profile!
            </p>
            <Link
              href="/create"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow transition-transform hover:-translate-y-0.5"
            >
              <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Start personalising
            </Link>
          </div>
        </div>
      </section>

      {/* ── Sample books grid ─────────────────────────────────────────────── */}
      <section className="bg-card border-t-[2.5px] border-foreground">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="font-display text-4xl font-black md:text-5xl">Stories made with our studio</h2>
              <p className="mt-2 text-muted-foreground">Click to read one — it takes 30 seconds.</p>
            </div>
            <Link href="/library" className="hidden text-sm font-extrabold underline-offset-4 hover:underline md:inline">
              Browse more →
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLE_BOOKS.map((b, i) => (
              <motion.div
                key={b.title}
                whileHover={{ y: -6, rotate: i % 2 === 0 ? -1 : 1 }}
                className="group overflow-hidden rounded-2xl bg-background chunky-border chunky-shadow-sm"
              >
                <div className="aspect-[3/4] overflow-hidden bg-muted">
                  <img src={b.img} alt={b.title} loading="lazy" className="h-full w-full object-cover" />
                </div>
                <div className="border-t-[2.5px] border-foreground p-3">
                  <div className="font-display text-lg font-black leading-tight">{b.title}</div>
                  <div className="flex items-center justify-between text-xs font-bold text-muted-foreground mt-0.5">
                    <span>{b.age}</span>
                    <span>{b.pages} pages</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KDP Publishing callout ────────────────────────────────────────── */}
      <section className="border-y-[2.5px] border-foreground bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-16 flex flex-col md:flex-row items-center gap-8">
          <div className="text-6xl shrink-0">📦</div>
          <div className="flex-1">
            <h2 className="font-display text-3xl font-black md:text-4xl">
              Publish on Amazon KDP — we handle the hard part
            </h2>
            <p className="mt-3 text-primary-foreground/80 max-w-lg">
              Every book includes a KDP-ready export with title, description, keywords, categories,
              author bio, and a formatting guide. Upload to Amazon in an afternoon and start earning royalties.
            </p>
          </div>
          <Link
            href="/kdp"
            className="shrink-0 inline-flex items-center gap-2 rounded-full bg-background text-foreground px-6 py-3 text-sm font-extrabold chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
          >
            Learn about KDP <ArrowRight className="h-4 w-4" strokeWidth={3} />
          </Link>
        </div>
      </section>

      {/* ── Pricing clarity ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="font-display text-4xl font-black md:text-5xl">Simple, honest pricing</h2>
        <p className="mt-3 text-muted-foreground">No hidden fees. No watermarks. What you create is yours.</p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-card p-8 chunky-border chunky-shadow-sm text-left">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Free</p>
            <p className="font-display text-5xl font-black mt-1">$0</p>
            <p className="text-sm text-muted-foreground mt-1">No credit card</p>
            <ul className="mt-6 space-y-2.5 text-sm font-semibold">
              {["Unlimited story creation", "AI writing + character design", "Interactive online reader", "PDF download", "Public sharing link"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-[10px] font-black">✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/auth/signup" className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform">
              <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Create My First Book
            </Link>
          </div>

          <div className="rounded-3xl bg-foreground text-background p-8 chunky-border chunky-shadow text-left relative overflow-hidden">
            <div className="absolute top-4 right-4 rounded-full bg-highlight text-foreground px-3 py-1 text-xs font-extrabold chunky-border">Coming soon</div>
            <p className="text-xs font-extrabold uppercase tracking-wider opacity-60">Pro</p>
            <p className="font-display text-5xl font-black mt-1">$9<span className="text-2xl font-bold opacity-60">/mo</span></p>
            <p className="text-sm opacity-60 mt-1">Cancel anytime</p>
            <ul className="mt-6 space-y-2.5 text-sm font-semibold">
              {["Everything in Free", "AI narration with voice cloning", "Custom voice studio", "Bulk illustration queue", "Priority generation", "KDP publishing assistant"].map((f) => (
                <li key={f} className="flex items-center gap-2 opacity-80">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-background/20 text-[10px] font-black">✓</span> {f}
                </li>
              ))}
            </ul>
            <button disabled className="mt-8 flex w-full items-center justify-center rounded-full bg-background/20 py-3 text-sm font-extrabold opacity-60 chunky-border cursor-not-allowed">
              Join waitlist
            </button>
          </div>
        </div>
      </section>

      {/* ── Trust signals ─────────────────────────────────────────────────── */}
      <section className="border-t-[2.5px] border-foreground bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {TRUST_POINTS.map((t) => (
              <div key={t.text} className="flex items-center gap-3 rounded-2xl bg-background p-4 chunky-border">
                <t.icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} />
                <p className="text-sm font-bold leading-snug">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h2 className="font-display text-4xl font-black md:text-5xl">
          Your child&apos;s story is waiting to be told.
        </h2>
        <p className="mt-4 text-muted-foreground">Start with one idea. We&apos;ll handle the rest.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow transition-transform hover:-translate-y-1"
          >
            <Sparkles className="h-5 w-5" strokeWidth={2.5} /> Create My First Book — Free
          </Link>
          <Link
            href="/library"
            className="inline-flex items-center gap-2 rounded-full bg-card px-6 py-4 text-base font-extrabold chunky-border chunky-shadow-sm transition-transform hover:-translate-y-1"
          >
            <BookOpen className="h-4 w-4" strokeWidth={2.5} /> View Sample Books
          </Link>
        </div>
      </section>

      <footer className="border-t-[2.5px] border-foreground bg-foreground py-10 text-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm md:flex-row">
          <div className="font-display text-xl font-black">Storybook.Studio</div>
          <div className="opacity-60 text-xs">
            Your stories are private by default. We never sell your data.
          </div>
          <div className="opacity-70">© {new Date().getFullYear()} — Made by Krish Patel</div>
        </div>
      </footer>
    </main>
  );
}
