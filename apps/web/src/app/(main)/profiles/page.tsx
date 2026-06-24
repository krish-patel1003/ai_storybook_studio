"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Baby, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type ChildProfile, type CreateProfileIn } from "@/lib/api";
import { toast } from "sonner";
import { LgSpinner } from "@/components/character-spinner";

const GRADE_OPTIONS = ["preschool", "K", "1", "2", "3", "4", "5", "6+"];
const READING_LEVELS = [
  { id: "beginner",     label: "Beginner" },
  { id: "early_reader", label: "Early Reader" },
  { id: "chapter_book", label: "Chapter Books" },
];
const GENDER_OPTIONS = [
  { id: "boy",         label: "Boy",         emoji: "👦" },
  { id: "girl",        label: "Girl",        emoji: "👧" },
  { id: "nonbinary",   label: "Non-binary",  emoji: "🧒" },
  { id: "unspecified", label: "Prefer not to say", emoji: "⭐" },
];
const AVATAR_EMOJIS = ["⭐","🦊","🐻","🦁","🐼","🐨","🦄","🐉","🚀","🌈","🦋","🐸","🎨","🎵","⚽","📚"];

const INTEREST_TAGS = [
  "dinosaurs","space","animals","robots","magic","ocean","forest","art","music","sports",
  "cooking","science","history","superheroes","fairy tales","adventure",
];

const BLANK: CreateProfileIn = {
  name: "", author_name: null, age: 5, gender: "unspecified", grade_level: "K",
  interests: [], reading_level: "beginner", avatar_emoji: "⭐",
};

function ProfileForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: CreateProfileIn;
  onSave: (data: CreateProfileIn) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CreateProfileIn>(initial);

  function toggleInterest(tag: string) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(tag)
        ? f.interests.filter((i) => i !== tag)
        : [...f.interests, tag],
    }));
  }

  return (
    <div className="rounded-3xl bg-card p-6 chunky-border chunky-shadow-sm space-y-5">
      {/* Avatar picker */}
      <div>
        <p className="text-xs font-extrabold text-muted-foreground mb-2 uppercase tracking-wide">Avatar</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => setForm((f) => ({ ...f, avatar_emoji: emoji }))}
              className={`text-2xl w-10 h-10 rounded-xl flex items-center justify-center chunky-border transition-colors ${
                form.avatar_emoji === emoji ? "bg-primary" : "bg-background hover:bg-muted"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Name + Age row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-extrabold text-muted-foreground uppercase tracking-wide">Child's Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Mia"
            className="mt-1 w-full rounded-xl bg-background px-3 py-2 text-sm font-bold chunky-border focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="text-xs font-extrabold text-muted-foreground uppercase tracking-wide">Age</label>
          <input
            type="number" min={1} max={18}
            value={form.age}
            onChange={(e) => setForm((f) => ({ ...f, age: parseInt(e.target.value) || 1 }))}
            className="mt-1 w-full rounded-xl bg-background px-3 py-2 text-sm font-bold chunky-border focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Author name */}
      <div>
        <label className="text-xs font-extrabold text-muted-foreground uppercase tracking-wide">Author Name <span className="font-normal normal-case text-muted-foreground">(optional)</span></label>
        <input
          value={form.author_name ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value || null }))}
          placeholder="e.g. Mia Smith — shown on book covers"
          className="mt-1 w-full rounded-xl bg-background px-3 py-2 text-sm font-bold chunky-border focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Gender */}
      <div>
        <p className="text-xs font-extrabold text-muted-foreground mb-2 uppercase tracking-wide">Gender</p>
        <div className="flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((g) => (
            <button
              key={g.id}
              onClick={() => setForm((f) => ({ ...f, gender: g.id as CreateProfileIn["gender"] }))}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold chunky-border transition-colors ${
                form.gender === g.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              {g.emoji} {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grade + Reading level */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-extrabold text-muted-foreground mb-2 uppercase tracking-wide">Grade Level</p>
          <div className="flex flex-wrap gap-1.5">
            {GRADE_OPTIONS.map((g) => (
              <button
                key={g}
                onClick={() => setForm((f) => ({ ...f, grade_level: g }))}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold chunky-border transition-colors ${
                  form.grade_level === g ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                }`}
              >
                {g === "preschool" ? "Pre-K" : g === "K" ? "Kinder" : `Grade ${g}`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-extrabold text-muted-foreground mb-2 uppercase tracking-wide">Reading Level</p>
          <div className="flex flex-col gap-1.5">
            {READING_LEVELS.map((r) => (
              <button
                key={r.id}
                onClick={() => setForm((f) => ({ ...f, reading_level: r.id as CreateProfileIn["reading_level"] }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold chunky-border transition-colors text-left ${
                  form.reading_level === r.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interests */}
      <div>
        <p className="text-xs font-extrabold text-muted-foreground mb-2 uppercase tracking-wide">Interests</p>
        <div className="flex flex-wrap gap-2">
          {INTEREST_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleInterest(tag)}
              className={`rounded-full px-3 py-1 text-xs font-bold capitalize chunky-border transition-colors ${
                form.interests.includes(tag) ? "bg-accent text-accent-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:translate-y-0"
        >
          <Check className="h-4 w-4" strokeWidth={3} /> {saving ? "Saving…" : "Save Profile"}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-bold chunky-border hover:-translate-y-0.5 transition-transform"
        >
          <X className="h-4 w-4" strokeWidth={2.5} /> Cancel
        </button>
      </div>
    </div>
  );
}

function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: ChildProfile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const genderEmoji = GENDER_OPTIONS.find((g) => g.id === profile.gender)?.emoji ?? "⭐";
  const readingLabel = READING_LEVELS.find((r) => r.id === profile.reading_level)?.label ?? profile.reading_level;

  return (
    <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm flex gap-4">
      <div className="text-4xl shrink-0 w-16 h-16 flex items-center justify-center rounded-2xl bg-accent chunky-border">
        {profile.avatar_emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-xl font-black">{profile.name}</h3>
            <p className="text-sm text-muted-foreground">{genderEmoji} Age {profile.age} · Grade {profile.grade_level} · {readingLabel}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border hover:-translate-y-0.5 transition-transform">
              <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <button onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border hover:-translate-y-0.5 transition-transform text-destructive">
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        {profile.interests.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.interests.map((i) => (
              <span key={i} className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold capitalize">{i}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfilesPage() {
  const { token } = useAuth();
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.profiles.list(token).then(setProfiles).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function handleCreate(data: CreateProfileIn) {
    if (!token) return;
    setSaving(true);
    try {
      const p = await api.profiles.create(token, data);
      setProfiles((prev) => [...prev, p]);
      setShowNew(false);
      toast.success(`${p.name}'s profile created!`);
    } catch {
      toast.error("Failed to create profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, data: CreateProfileIn) {
    if (!token) return;
    setSaving(true);
    try {
      const p = await api.profiles.update(token, id, data);
      setProfiles((prev) => prev.map((x) => (x.id === id ? p : x)));
      setEditingId(null);
      toast.success("Profile updated!");
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!token || !confirm(`Delete ${name}'s profile?`)) return;
    try {
      await api.profiles.delete(token, id);
      setProfiles((prev) => prev.filter((x) => x.id !== id));
      toast.success("Profile deleted.");
    } catch {
      toast.error("Failed to delete profile.");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-black">Child Profiles</h1>
          <p className="mt-1 text-muted-foreground">Create profiles so every story is made just for them.</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditingId(null); }}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
        >
          <Plus className="h-4 w-4" strokeWidth={3} /> Add Child
        </button>
      </div>

      {showNew && (
        <div className="mb-6">
          <h2 className="font-display text-xl font-black mb-3">New Profile</h2>
          <ProfileForm initial={BLANK} onSave={handleCreate} onCancel={() => setShowNew(false)} saving={saving} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <LgSpinner />
        </div>
      ) : profiles.length === 0 && !showNew ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-accent chunky-border text-4xl">
            <Baby className="h-10 w-10 text-accent-foreground" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-display text-2xl font-black">No profiles yet</h2>
            <p className="mt-1 text-muted-foreground text-sm">Add a child profile to personalise every story.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map((p) =>
            editingId === p.id ? (
              <div key={p.id}>
                <h2 className="font-display text-xl font-black mb-3">Edit {p.name}</h2>
                <ProfileForm
                  initial={{ name: p.name, age: p.age, gender: p.gender, grade_level: p.grade_level, interests: p.interests, reading_level: p.reading_level, avatar_emoji: p.avatar_emoji }}
                  onSave={(data) => handleUpdate(p.id, data)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              </div>
            ) : (
              <ProfileCard key={p.id} profile={p} onEdit={() => { setEditingId(p.id); setShowNew(false); }} onDelete={() => handleDelete(p.id, p.name)} />
            )
          )}
        </div>
      )}
    </main>
  );
}
