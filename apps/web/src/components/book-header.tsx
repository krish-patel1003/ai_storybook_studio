"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Sparkles, LogOut, Library, ChevronDown, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useState, useRef, useEffect } from "react";

const navItems = [
  { href: "/create", label: "Create" },
  { href: "/library", label: "Library" },
  { href: "/outline", label: "Outline" },
  { href: "/editor", label: "Editor" },
  { href: "/reader", label: "Reader" },
] as const;

export function BookHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleLogout() {
    logout();
    setMenuOpen(false);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b-[2.5px] border-foreground bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary chunky-border chunky-shadow-sm">
            <BookOpen className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="font-display text-2xl font-black tracking-tight">
            Storybook<span className="text-primary">.</span>Studio
          </span>
        </Link>

        {/* Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
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

        {/* Right side */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <>
              <Link
                href="/create"
                className="hidden items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 md:inline-flex"
              >
                <Sparkles className="h-4 w-4" strokeWidth={2.5} />
                New book
              </Link>

              {/* User menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-3 chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                    {user.pen_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[100px] truncate text-sm font-extrabold md:block">
                    {user.pen_name}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                    strokeWidth={3}
                  />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-card p-1.5 chunky-border chunky-shadow">
                    <div className="border-b-[2px] border-foreground/10 px-3 py-2 mb-1">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        Signed in as
                      </p>
                      <p className="mt-0.5 truncate text-sm font-bold">{user.email}</p>
                    </div>

                    <Link
                      href="/books"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors hover:bg-highlight"
                    >
                      <Library className="h-4 w-4" strokeWidth={2.5} />
                      My Library
                    </Link>

                    <Link
                      href="/account"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors hover:bg-highlight"
                    >
                      <User className="h-4 w-4" strokeWidth={2.5} />
                      Account
                    </Link>

                    <div className="my-1 border-t-[2px] border-foreground/10" />

                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" strokeWidth={2.5} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="rounded-full bg-background px-4 py-2 text-sm font-extrabold chunky-border transition-transform hover:-translate-y-0.5"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <Sparkles className="h-4 w-4" strokeWidth={2.5} />
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
