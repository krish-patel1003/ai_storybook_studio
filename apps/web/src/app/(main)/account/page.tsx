"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, BookOpen, LogOut, Shield, Pencil, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function AccountPage() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const [editingPenName, setEditingPenName] = useState(false);
  const [penName, setPenName] = useState(user?.pen_name ?? "");

  function handleLogout() {
    logout();
    router.push("/");
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-3xl bg-muted" />
          ))}
        </div>
      </main>
    );
  }

  if (!user) {
    router.push("/auth/signin");
    return null;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-4xl font-black md:text-5xl">Your Account</h1>
      <p className="mt-2 text-muted-foreground">Manage your profile and preferences.</p>

      {/* Avatar + name */}
      <div className="mt-8 flex items-center gap-4 rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground chunky-border">
          {user.pen_name.charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          {editingPenName ? (
            <div className="flex items-center gap-2">
              <input
                value={penName}
                onChange={(e) => setPenName(e.target.value)}
                className="flex-1 rounded-xl border-[2px] border-foreground bg-background px-3 py-1.5 text-lg font-black focus:outline-none"
                autoFocus
              />
              <button
                onClick={() => setEditingPenName(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground chunky-border"
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </button>
              <button
                onClick={() => { setEditingPenName(false); setPenName(user.pen_name); }}
                className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border"
              >
                <X className="h-4 w-4" strokeWidth={3} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-black">{user.pen_name}</span>
              <button
                onClick={() => setEditingPenName(true)}
                className="rounded-full p-1 hover:bg-highlight transition-colors"
                title="Edit pen name"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary chunky-border">
            <Mail className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Email</p>
            <p className="font-bold">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent chunky-border">
            <User className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Pen Name</p>
            <p className="font-bold">{user.pen_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-highlight chunky-border">
            <Shield className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Account type</p>
            <p className="font-bold">{user.avatar_url ? "Google account" : "Email & password"}</p>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <a
          href="/library"
          className="flex items-center gap-2.5 rounded-2xl bg-card p-4 chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
        >
          <BookOpen className="h-5 w-5 text-primary" strokeWidth={2.5} />
          <span className="font-bold text-sm">My Library</span>
        </a>
        <a
          href="/create"
          className="flex items-center gap-2.5 rounded-2xl bg-primary p-4 chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
        >
          <BookOpen className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          <span className="font-bold text-sm text-primary-foreground">New Story</span>
        </a>
      </div>

      {/* Sign out */}
      <div className="mt-8 border-t-[2px] border-foreground/10 pt-6">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 rounded-2xl bg-card px-5 py-3 text-sm font-bold text-destructive chunky-border hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-4 w-4" strokeWidth={2.5} />
          Sign out
        </button>
      </div>
    </main>
  );
}
