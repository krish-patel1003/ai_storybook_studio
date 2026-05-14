"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Sparkles, Wand2, Palette, BookMarked, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div className="relative z-10 flex flex-col justify-center">
            <span className="mb-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-foreground chunky-border">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={3} /> AI Storybook Studio
            </span>
            <h1 className="font-display text-5xl font-black leading-[0.95] md:text-7xl">
              Turn one idea into a{" "}
              <span className="relative inline-block">
                <span className="relative z-10">storybook</span>
                <span className="absolute inset-x-0 bottom-1 h-4 -rotate-1 bg-highlight" aria-hidden />
              </span>
              .
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Give us a prompt. We&apos;ll write a children&apos;s book with consistent characters,
              hand-illustrated pages, and a print-ready PDF — in minutes.
            </p>
            <p className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-highlight px-3 py-1 text-sm font-extrabold text-foreground chunky-border">
              ✦ Publish-ready PDF &amp; EPUB export
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/create"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground chunky-border chunky-shadow transition-transform hover:-translate-y-1"
              >
                Start your story <ArrowRight className="h-5 w-5" strokeWidth={3} />
              </Link>
              <Link
                href="/reader"
                className="inline-flex items-center gap-2 rounded-full bg-card px-6 py-3 text-base font-extrabold text-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-1"
              >
                See an example
              </Link>
            </div>
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

      {/* How it works */}
      <section className="border-y-[2.5px] border-foreground bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <h2 className="text-center font-display text-4xl font-black md:text-5xl">
            From idea to bedtime, in 3 steps
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Wand2,
                title: "1. Prompt",
                desc: "Tell us a one-line idea and pick the age range. We turn it into a full story brief.",
                bg: "bg-primary",
                fg: "text-primary-foreground",
              },
              {
                icon: Palette,
                title: "2. Illustrate",
                desc: "Lock your characters once. We generate consistent, beautiful illustrations for every page.",
                bg: "bg-secondary",
                fg: "text-secondary-foreground",
              },
              {
                icon: BookMarked,
                title: "3. Publish",
                desc: "Read it interactively, share a link, or export a Kindle-ready PDF & EPUB.",
                bg: "bg-accent",
                fg: "text-accent-foreground",
              },
            ].map((s) => (
              <div
                key={s.title}
                className="rounded-3xl bg-background p-6 chunky-border chunky-shadow-sm"
              >
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

      {/* Sample books */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-4xl font-black md:text-5xl">Made by storytellers like you</h2>
          <Link href="/reader" className="hidden text-sm font-extrabold underline-offset-4 hover:underline md:inline">
            Open a sample →
          </Link>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { img: "/assets/cover.jpg", title: "The Brave Little Fox", age: "Ages 3–5" },
            { img: "/assets/page1.jpg", title: "Pip's Cozy Morning", age: "Ages 3–5" },
            { img: "/assets/page2.jpg", title: "Professor Hoot Knows", age: "Ages 6–8" },
            { img: "/assets/page3.jpg", title: "Berries by the Stream", age: "Ages 3–5" },
          ].map((b, i) => (
            <motion.div
              key={b.title}
              whileHover={{ y: -6, rotate: i % 2 === 0 ? -1 : 1 }}
              className="group overflow-hidden rounded-2xl bg-card chunky-border chunky-shadow-sm"
            >
              <div className="aspect-[3/4] overflow-hidden bg-muted">
                <img src={b.img} alt={b.title} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="border-t-[2.5px] border-foreground p-3">
                <div className="font-display text-lg font-black leading-tight">{b.title}</div>
                <div className="text-xs font-bold text-muted-foreground">{b.age}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t-[2.5px] border-foreground bg-foreground py-10 text-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm md:flex-row">
          <div className="font-display text-xl font-black">Storybook.Studio</div>
          <div className="opacity-70">© {new Date().getFullYear()} — Made with crayons &amp; code.</div>
        </div>
      </footer>
    </main>
  );
}
