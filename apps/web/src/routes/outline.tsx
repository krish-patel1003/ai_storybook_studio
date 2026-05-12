import { createFileRoute, Link } from "@tanstack/react-router";
import { GripVertical, RefreshCw, Pencil, Plus, Lock, Sparkles } from "lucide-react";
import { mockCharacters } from "@/lib/mock-book";

export const Route = createFileRoute("/outline")({
  head: () => ({
    meta: [
      { title: "Outline — Storybook Studio" },
      { name: "description", content: "Page-by-page outline of your generated children's book." },
    ],
  }),
  component: OutlinePage,
});

const outline = [
  "Pip wakes up in his cozy burrow as morning light arrives.",
  "He tiptoes through the dewy grass, looking for an adventure.",
  "High in the oak tree, Professor Hoot is waiting with a riddle.",
  "Pip follows a winding path to a silver stream.",
  "He meets a kind bunny who is hungry and far from home.",
  "Pip hesitates — there are only a few berries in his pocket.",
  "He shares them. The bunny smiles bigger than the sun.",
  "Together they discover a hidden meadow full of wildflowers.",
  "The forest fills with friends as the day turns gold.",
  "Tucked beneath the moon, Pip whispers, \"Tomorrow, again.\"",
];

function OutlinePage() {
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-10 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-black md:text-5xl">Story outline</h1>
            <p className="mt-1 text-muted-foreground">10 pages, ready to illustrate. Reorder, edit, or regenerate any beat.</p>
          </div>
          <Link
            to="/editor"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
          >
            <Sparkles className="h-4 w-4" strokeWidth={3} /> Illustrate it
          </Link>
        </div>

        <ol className="mt-6 space-y-3">
          {outline.map((line, i) => (
            <li
              key={i}
              className="group flex items-center gap-3 rounded-2xl bg-card p-4 chunky-border chunky-shadow-sm"
            >
              <button className="cursor-grab text-muted-foreground hover:text-foreground">
                <GripVertical className="h-5 w-5" />
              </button>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-highlight font-display font-black chunky-border">
                {i + 1}
              </span>
              <p className="flex-1 font-semibold leading-snug">{line}</p>
              <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                <button className="grid h-9 w-9 place-items-center rounded-full bg-background hover:bg-secondary chunky-border">
                  <Pencil className="h-4 w-4" strokeWidth={2.5} />
                </button>
                <button className="grid h-9 w-9 place-items-center rounded-full bg-background hover:bg-accent chunky-border">
                  <RefreshCw className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            </li>
          ))}

          <li>
            <button className="flex w-full items-center justify-center gap-2 rounded-2xl border-[2.5px] border-dashed border-foreground/40 bg-transparent px-4 py-4 text-sm font-extrabold text-foreground/60 hover:bg-card hover:text-foreground">
              <Plus className="h-4 w-4" strokeWidth={3} /> Add page
            </button>
          </li>
        </ol>
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm">
          <h2 className="font-display text-2xl font-black">Cast</h2>
          <p className="text-sm text-muted-foreground">Locked traits keep them consistent.</p>
          <div className="mt-4 space-y-3">
            {mockCharacters.map((c) => (
              <div key={c.id} className="rounded-2xl bg-background p-3 chunky-border">
                <div className="flex items-center gap-3">
                  <img src={c.image} alt={c.name} className="h-14 w-14 rounded-xl object-cover chunky-border" />
                  <div className="flex-1">
                    <div className="font-display text-lg font-black">{c.name}</div>
                    <div className="flex items-center gap-1 text-xs font-bold text-accent-foreground">
                      <Lock className="h-3 w-3" /> {c.traits.length} locked traits
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.traits.map((t) => (
                    <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <button className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-[2.5px] border-dashed border-foreground/40 px-3 py-3 text-sm font-extrabold text-foreground/60 hover:bg-background hover:text-foreground">
              <Plus className="h-4 w-4" strokeWidth={3} /> Add character
            </button>
          </div>
        </div>
      </aside>
    </main>
  );
}