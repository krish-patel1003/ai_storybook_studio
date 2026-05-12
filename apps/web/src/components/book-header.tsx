import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Sparkles } from "lucide-react";

const navItems = [
  { to: "/create", label: "Create" },
  { to: "/outline", label: "Outline" },
  { to: "/editor", label: "Editor" },
  { to: "/reader", label: "Reader" },
  { to: "/export", label: "Export" },
] as const;

export function BookHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-40 border-b-[2.5px] border-foreground bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary chunky-border chunky-shadow-sm">
            <BookOpen className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="font-display text-2xl font-black tracking-tight">
            Storybook<span className="text-primary">.</span>Studio
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition-all ${
                  active
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-highlight"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          to="/create"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2.5} />
          New book
        </Link>
      </div>
    </header>
  );
}