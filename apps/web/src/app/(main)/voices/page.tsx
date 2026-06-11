"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic,
  Plus,
  Trash2,
  Loader2,
  Wand2,
  Check,
  X,
  Play,
  Square,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type VoiceProfile } from "@/lib/api";
import { VoiceRecorder } from "@/components/voice-recorder";
import { toast } from "sonner";

// ── Recording modal (3 steps) ─────────────────────────────────────────────────

type ModalStep = "record" | "name" | "creating";

function RecordModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: VoiceProfile) => void }) {
  const { token } = useAuth();
  const [step, setStep] = useState<ModalStep>("record");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  function handleRecordingComplete(b: Blob) {
    setBlob(b);
    setStep("name");
  }

  async function handleCreate() {
    if (!token || !blob || !name.trim()) return;
    setCreating(true);
    setStep("creating");
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");
      formData.append("name", name.trim());
      const profile = await api.voices.upload(token, formData);
      toast.success(`"${profile.name}" voice created!`);
      onCreated(profile);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create voice — please try again");
      setStep("name");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-card p-7 chunky-border chunky-shadow"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl font-black">
              {step === "record" && "Record your voice"}
              {step === "name" && "Name this voice"}
              {step === "creating" && "Creating your voice…"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {step === "record" && "Read the passage below clearly. ~60 seconds is ideal."}
              {step === "name" && "Give it a memorable name so you can find it later."}
              {step === "creating" && "Cloning your voice with ElevenLabs — this takes about 10 seconds."}
            </p>
          </div>
          {step !== "creating" && (
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border hover:-translate-y-0.5 transition-transform"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Step: record */}
        {step === "record" && (
          <VoiceRecorder
            onComplete={handleRecordingComplete}
            onCancel={onClose}
          />
        )}

        {/* Step: name */}
        {step === "name" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-background p-3 chunky-border flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
              <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
              Recording saved — ready to clone
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-1.5">
                Voice name
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && handleCreate()}
                placeholder="e.g. Mom's Voice, Dad's Voice, Lily's Voice"
                className="w-full rounded-2xl bg-background px-4 py-3 text-sm font-semibold chunky-border outline-none focus:ring-4 focus:ring-primary/30"
                maxLength={100}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={!name.trim()}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-extrabold text-primary-foreground text-sm chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0"
              >
                <Wand2 className="h-4 w-4" strokeWidth={2.5} />
                Create voice
              </button>
              <button
                onClick={() => setStep("record")}
                className="rounded-full bg-background px-5 py-2.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
              >
                Re-record
              </button>
            </div>
          </div>
        )}

        {/* Step: creating */}
        {step === "creating" && (
          <div className="flex flex-col items-center gap-5 py-6">
            <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-primary chunky-border chunky-shadow">
              <Mic className="h-9 w-9 text-primary-foreground" strokeWidth={1.5} />
              <span className="absolute -right-2 -top-2 h-5 w-5 animate-spin rounded-full border-[3px] border-foreground border-t-transparent" />
            </div>
            <div className="text-center">
              <p className="font-extrabold">Uploading &amp; cloning…</p>
              <p className="text-sm text-muted-foreground mt-1">
                ElevenLabs is learning to sound like you
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Voice profile card ────────────────────────────────────────────────────────

function VoiceCard({ profile, onDelete }: { profile: VoiceProfile; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const { token } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const audioEl = useRef<HTMLAudioElement | null>(null);

  async function handlePlayPause() {
    if (!token) return;

    // If already playing — stop
    if (playing) {
      audioEl.current?.pause();
      setPlaying(false);
      return;
    }

    // If audio not loaded yet — fetch and attach
    if (!audioEl.current?.src) {
      setLoadingAudio(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/voices/${profile.id}/sample`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load sample");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!audioEl.current) audioEl.current = new Audio();
        audioEl.current.src = url;
        audioEl.current.onended = () => setPlaying(false);
      } catch {
        toast.error("Could not load voice sample");
        return;
      } finally {
        setLoadingAudio(false);
      }
    }

    audioEl.current?.play();
    setPlaying(true);
  }

  // Stop audio when card unmounts
  useEffect(() => {
    return () => {
      audioEl.current?.pause();
      if (audioEl.current?.src) URL.revokeObjectURL(audioEl.current.src);
    };
  }, []);

  async function handleDelete() {
    if (!token) return;
    audioEl.current?.pause();
    setDeleting(true);
    try {
      await api.voices.delete(token, profile.id);
      onDelete(profile.id);
      toast.success(`"${profile.name}" deleted`);
    } catch {
      toast.error("Failed to delete voice");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl bg-card p-4 chunky-border chunky-shadow-sm flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Play / stop button */}
        <button
          onClick={handlePlayPause}
          disabled={loadingAudio}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl chunky-border transition-all hover:-translate-y-0.5 disabled:opacity-50 ${
            playing ? "bg-primary/10 text-primary" : "bg-primary text-primary-foreground"
          }`}
          title={playing ? "Stop" : "Play recording"}
        >
          {loadingAudio ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Square className="h-4 w-4" strokeWidth={2.5} />
          ) : (
            <Play className="h-4 w-4" strokeWidth={2.5} />
          )}
        </button>

        <div className="min-w-0">
          <p className="font-extrabold truncate">{profile.name}</p>
          <p className="text-xs text-muted-foreground">
            Created {new Date(profile.created_at).toLocaleDateString()}
            {playing && <span className="ml-2 text-primary font-bold animate-pulse">▶ playing…</span>}
          </p>
        </div>
      </div>

      <div className="shrink-0">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">Delete?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full bg-destructive px-3 py-1 text-xs font-extrabold text-white chunky-border disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-full bg-background px-3 py-1 text-xs font-extrabold chunky-border"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="grid h-8 w-8 place-items-center rounded-full bg-background chunky-border hover:-translate-y-0.5 hover:bg-destructive/10 transition-all"
            title="Delete voice"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VoicesPage() {
  const { token } = useAuth();
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.voices
      .list(token)
      .then(setProfiles)
      .catch(() => toast.error("Could not load voice profiles"))
      .finally(() => setLoading(false));
  }, [token]);

  function handleCreated(profile: VoiceProfile) {
    setProfiles((prev) => [profile, ...prev]);
    setShowModal(false);
  }

  function handleDeleted(id: string) {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <>
      <AnimatePresence>
        {showModal && (
          <RecordModal
            onClose={() => setShowModal(false)}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-3xl px-4 py-12">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-black md:text-5xl">Voice Studio</h1>
            <p className="mt-2 text-muted-foreground max-w-md">
              Record your voice once and use it to narrate any storybook. The more you read, the better the clone sounds.
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-extrabold text-primary-foreground text-sm chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
            Record new voice
          </motion.button>
        </div>

        {/* How it works callout */}
        <div className="rounded-3xl bg-card p-5 chunky-border chunky-shadow-sm mb-8">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-3">
            How it works
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { n: "1", text: "Record ~60s of yourself reading the provided story passage" },
              { n: "2", text: "We clone your voice using ElevenLabs AI — takes about 10 seconds" },
              { n: "3", text: "Pick your voice in the editor's narration bar to narrate any book page" },
            ].map(({ n, text }) => (
              <div key={n} className="flex gap-3 items-start">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-extrabold chunky-border">
                  {n}
                </span>
                <p className="text-sm font-semibold text-muted-foreground leading-snug">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Voice profiles */}
        {loading ? (
          <div className="flex items-center gap-3 text-muted-foreground py-10 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-bold">Loading voices…</span>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-border py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted chunky-border">
              <Mic className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-extrabold text-lg">No voices yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Record your first voice to get started
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform"
            >
              <Plus className="h-4 w-4" strokeWidth={3} />
              Record your first voice
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-3">
              Saved voices
            </p>
            <motion.div layout className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {profiles.map((p) => (
                  <VoiceCard key={p.id} profile={p} onDelete={handleDeleted} />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </main>
    </>
  );
}
