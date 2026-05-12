import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Volume2, X } from "lucide-react";
import { mockBook } from "@/lib/mock-book";

export const Route = createFileRoute("/reader")({
  head: () => ({
    meta: [
      { title: "Read — Storybook Studio" },
      { name: "description", content: "Interactive reader for your generated children's book." },
    ],
  }),
  component: ReaderPage,
});

function ReaderPage() {
  // pair pages: cover alone, then [1,2],[3,4]...
  const pages = mockBook.pages;
  const [spread, setSpread] = useState(0);
  const [aloud, setAloud] = useState(false);

  // build spreads
  const spreads: { left?: typeof pages[number]; right?: typeof pages[number] }[] = [];
  spreads.push({ right: pages[0] }); // cover
  for (let i = 1; i < pages.length; i += 2) {
    spreads.push({ left: pages[i], right: pages[i + 1] });
  }

  const cur = spreads[spread];
  const total = spreads.length;

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="font-display text-lg font-black">{mockBook.title}</div>
        <Link to="/editor" className="rounded-full bg-card p-2 chunky-border">
          <X className="h-4 w-4" strokeWidth={3} />
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={spread}
            initial={{ rotateY: 60, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -60, opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ transformStyle: "preserve-3d", perspective: 1200 }}
            className="grid w-full max-w-5xl gap-1 md:grid-cols-2"
          >
            {cur.left ? <ReaderPage_ page={cur.left} side="left" /> : <div className="hidden md:block" />}
            {cur.right && <ReaderPage_ page={cur.right} side="right" />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom bar */}
      <div className="fixed inset-x-0 bottom-0 border-t-[2.5px] border-foreground bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => setSpread(Math.max(0, spread - 1))}
            disabled={spread === 0}
            className="grid h-11 w-11 place-items-center rounded-full bg-background chunky-border chunky-shadow-sm disabled:opacity-40"
          >
            <ChevronLeft strokeWidth={3} />
          </button>
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-black">
              {spread + 1} / {total}
            </span>
            <button
              onClick={() => setAloud(!aloud)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold chunky-border ${
                aloud ? "bg-accent text-accent-foreground" : "bg-background"
              }`}
            >
              <Volume2 className="h-4 w-4" strokeWidth={2.5} />
              Read aloud
            </button>
          </div>
          <button
            onClick={() => setSpread(Math.min(total - 1, spread + 1))}
            disabled={spread === total - 1}
            className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground chunky-border chunky-shadow-sm disabled:opacity-40"
          >
            <ChevronRight strokeWidth={3} />
          </button>
        </div>
      </div>
    </main>
  );
}

function ReaderPage_({
  page,
  side,
}: {
  page: { image: string; text: string; isCover?: boolean };
  side: "left" | "right";
}) {
  return (
    <div
      className={`overflow-hidden bg-card chunky-border chunky-shadow ${
        side === "left" ? "rounded-l-3xl md:rounded-r-none rounded-3xl" : "rounded-r-3xl md:rounded-l-none rounded-3xl"
      }`}
    >
      <div className="aspect-[4/3] bg-muted">
        <img src={page.image} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="border-t-[2.5px] border-foreground p-6 md:p-8">
        {page.isCover ? (
          <h2 className="text-center font-display text-4xl font-black md:text-5xl">{page.text}</h2>
        ) : (
          <p className="font-display text-lg leading-relaxed md:text-xl">{page.text}</p>
        )}
      </div>
    </div>
  );
}