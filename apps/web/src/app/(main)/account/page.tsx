"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, BookOpen, LogOut, Shield, Pencil, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export default function AccountPage() {
  const { user, token, logout, isLoading, updateUser } = useAuth();
  const router = useRouter();
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingAuthorName, setEditingAuthorName] = useState(false);
  const [usernameValue, setUsernameValue] = useState(user?.username ?? "");
  const [authorNameValue, setAuthorNameValue] = useState(user?.author_name ?? "");
  const [saving, setSaving] = useState(false);

  function handleLogout() {
    logout();
    router.push("/");
  }

  async function saveUsername() {
    if (!token || !usernameValue.trim()) return;
    setSaving(true);
    try {
      await updateUser({ username: usernameValue.trim() });
      toast.success("Username updated");
    } catch {
      toast.error("Failed to update username");
    } finally {
      setSaving(false);
      setEditingUsername(false);
    }
  }

  async function saveAuthorName() {
    if (!token) return;
    setSaving(true);
    try {
      await updateUser({ author_name: authorNameValue.trim() || undefined });
      toast.success("Author name updated");
    } catch {
      toast.error("Failed to update author name");
    } finally {
      setSaving(false);
      setEditingAuthorName(false);
    }
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

      {/* Avatar + username */}
      <div className="mt-8 flex items-center gap-4 rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground chunky-border">
          {user.username.charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          {editingUsername ? (
            <div className="flex items-center gap-2">
              <input
                value={usernameValue}
                onChange={(e) => setUsernameValue(e.target.value)}
                className="flex-1 rounded-xl border-[2px] border-foreground bg-background px-3 py-1.5 text-lg font-black focus:outline-none"
                autoFocus
              />
              <button
                onClick={saveUsername}
                disabled={saving}
                className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground chunky-border disabled:opacity-50"
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </button>
              <button
                onClick={() => { setEditingUsername(false); setUsernameValue(user.username); }}
                className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border"
              >
                <X className="h-4 w-4" strokeWidth={3} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-black">{user.username}</span>
              <button
                onClick={() => { setEditingUsername(true); setUsernameValue(user.username); }}
                className="rounded-full p-1 hover:bg-highlight transition-colors"
                title="Edit username"
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

        {/* Author name — editable, used on book covers */}
        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 chunky-border">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent chunky-border">
            <User className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Author Name</p>
            <p className="text-xs text-muted-foreground mb-1">Shown on book covers and exports</p>
            {editingAuthorName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  value={authorNameValue}
                  onChange={(e) => setAuthorNameValue(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="flex-1 rounded-xl border-[2px] border-foreground bg-background px-3 py-1.5 text-sm font-bold focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={saveAuthorName}
                  disabled={saving}
                  className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground chunky-border disabled:opacity-50"
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
                <button
                  onClick={() => { setEditingAuthorName(false); setAuthorNameValue(user.author_name ?? ""); }}
                  className="grid h-8 w-8 place-items-center rounded-full bg-card chunky-border"
                >
                  <X className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold">{user.author_name || <span className="text-muted-foreground italic font-normal text-sm">Not set — using username</span>}</p>
                <button
                  onClick={() => { setEditingAuthorName(true); setAuthorNameValue(user.author_name ?? ""); }}
                  className="rounded-full p-1 hover:bg-highlight transition-colors"
                  title="Edit author name"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
            )}
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
