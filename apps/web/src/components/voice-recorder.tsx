"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Square, RotateCcw, Check } from "lucide-react";

// ── Sample script shown to the user while recording ──────────────────────────
// A corpus of short, varied children's-story paragraphs. The displayed script is
// assembled to roughly fill the duration the user picks (cycling the corpus for
// the longest options), so there's always enough — and enough variety — to read.

const SCRIPT_CORPUS: string[] = [
  `Once upon a time, in a little house at the edge of a great forest, there lived a young girl named Mara. Every morning, she would wake up before the sun and run to the window to watch the deer drink from the stream below.`,
  `One Tuesday — she remembered it was Tuesday because she'd had porridge for breakfast — she spotted something unusual. A small fox with a bright orange tail was sitting at the edge of the water, looking up at her window with curious, golden eyes.`,
  `"Hello there," she whispered, so as not to frighten it. The fox tilted its head. Then it did something extraordinary: it sat down, wrapped its tail neatly around its paws, and waited.`,
  `Mara ran downstairs, grabbed a piece of bread from the kitchen table, and slipped out the back door. The morning air was cold and sweet. She held out her hand — slowly, slowly — until she felt the warmth of the fox's nose against her palm.`,
  `"Would you like to be friends?" she asked softly. The fox blinked once, as if to say, "Yes, of course." And so the summer began.`,
  `They explored the whole forest together — the mossy hollow where the owls slept, the tall grass that whispered secrets when the wind blew, and the little waterfall that sparkled like a thousand tiny stars.`,
  `"Look! Look up there!" Mara cried one afternoon, pointing at a kite tangled high in the branches of the oldest oak. "However will we reach it?" But the fox was clever. He darted up the trunk, light as a leaf, and with a flick of his paw the kite tumbled free.`,
  `Down, down it floated, and Mara caught it, laughing so hard that she tumbled backwards into the soft, warm grass. Above them a family of swallows swooped and dived, as if they were playing the very same game.`,
  `In the village below, the baker was pulling warm loaves from the oven, the blacksmith's hammer rang like a bell, and old Mrs Pepper was watering the geraniums on her windowsill. "Good morning!" she called to everyone who passed. "Isn't it a perfectly splendid day?"`,
  `When the afternoon grew hot, Mara and the fox rested beneath a willow tree by the river. She told him stories — of pirate ships and faraway lands, of dragons who were really quite shy, and of a moon made entirely of cheese. The fox listened to every word, his ears twitching at the exciting parts.`,
  `Autumn came, and the leaves turned the colour of fire. Winter followed, soft and white, and they left little footprints — two feet and four paws — all across the snow. And when spring returned at last, the stream filled up again, and the deer came back to drink.`,
  `That night, as the moon rose round and silver over the trees, Mara sat by her window and smiled. Some friendships, she thought, are made in an instant — and last a whole lifetime. And from that day on, they were the very best of friends. The end.`,
];

// ~130 words per minute is a comfortable read-aloud pace for story text.
const WORDS_PER_MINUTE = 130;

function buildScript(minutes: number): string {
  const targetWords = Math.round(minutes * WORDS_PER_MINUTE);
  const paras: string[] = [];
  let count = 0;
  let i = 0;
  // Always include at least one paragraph; cycle the corpus for longer durations.
  do {
    const p = SCRIPT_CORPUS[i % SCRIPT_CORPUS.length];
    paras.push(p);
    count += p.trim().split(/\s+/).length;
    i += 1;
  } while (count < targetWords && i < 400);
  return paras.join("\n\n");
}

// Backwards-compatible default (≈2 minutes of text).
export const RECORDING_SCRIPT = buildScript(2);

// Duration options the user can pick — controls both the script length and the
// recording target. 1 min is the floor, 15 min the ceiling.
const DURATION_OPTIONS = [1, 2, 5, 10, 15] as const;

const MIN_SECONDS = 60;   // minimum before the user can stop (1 minute)
const MAX_SECONDS = 900;  // hard cap — auto-stop at 15 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onComplete: (blob: Blob) => void;
  onCancel: () => void;
}

type Phase = "idle" | "recording" | "review";

export function VoiceRecorder({ onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  // How long the user wants to record — drives the script length and the target.
  const [targetMinutes, setTargetMinutes] = useState<number>(2);
  const targetSeconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, targetMinutes * 60));
  const script = buildScript(targetMinutes);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // Object URL for the recorded blob, kept in state so the <audio> element
  // receives its `src` declaratively once it mounts in the review phase.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hard cap — automatically stop the recording at the 15-minute limit.
  useEffect(() => {
    if (phase === "recording" && elapsed >= MAX_SECONDS) stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, phase]);

  function stopEverything() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
  }

  function drawWaveform() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "#3b82f6"; // Tailwind blue-500
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    const sliceWidth = w / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }

  async function startRecording() {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up Web Audio analyser for waveform
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder — prefer webm, fall back to whatever browser supports
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        setBlob(finalBlob);

        // Create a fresh object URL and pass it to the <audio> via state. Setting
        // audioRef.current.src here would be too early — the audio element only
        // mounts once we switch to the review phase, so the src must be declarative.
        if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
        const url = URL.createObjectURL(finalBlob);
        audioBlobUrlRef.current = url;
        setPreviewUrl(url);

        setPhase("review");
      };

      recorder.start(100); // Collect chunks every 100ms
      setPhase("recording");
      setElapsed(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      // Start waveform animation
      drawWaveform();
    } catch (err: any) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Microphone access was denied. Please allow microphone access in your browser settings."
          : "Could not access your microphone. Please check your settings.";
      setPermissionError(msg);
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }

  function handleReRecord() {
    setBlob(null);
    setElapsed(0);
    setPhase("idle");
    if (audioRef.current) audioRef.current.pause();
    if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    audioBlobUrlRef.current = null;
    setPreviewUrl(null);
    setPlaying(false);
  }

  function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio || !previewUrl) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.currentTime = audio.currentTime >= (audio.duration || Infinity) ? 0 : audio.currentTime;
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  function handleUseRecording() {
    if (blob) onComplete(blob);
  }

  // Progress indicator
  const pct = Math.min((elapsed / targetSeconds) * 100, 100);
  const reachedMin = elapsed >= MIN_SECONDS;
  const reachedTarget = elapsed >= targetSeconds;

  return (
    <div className="space-y-5">
      {/* Script panel */}
      {phase !== "review" && (
        <div className="rounded-2xl bg-background p-4 chunky-border">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Read this aloud
            </p>
            {/* Duration picker — changes how much text is shown and the target length */}
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <span className="hidden sm:inline">Length</span>
              <select
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(Number(e.target.value))}
                className="rounded-lg bg-card px-2 py-1 text-xs font-extrabold text-foreground chunky-border outline-none focus:ring-2 focus:ring-primary/30"
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m} min{m === 2 ? " (recommended)" : ""}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="max-h-72 overflow-y-auto text-sm leading-loose whitespace-pre-line text-foreground/90">
            {script}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            ~2 minutes is plenty for a great clone — longer can help a little. Read at a natural, relaxed pace,
            the way you&apos;d read a bedtime story.
          </p>
        </div>
      )}

      {/* Permission error */}
      {permissionError && (
        <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 text-sm font-semibold text-destructive">
          {permissionError}
        </div>
      )}

      {/* Waveform canvas (only visible while recording) */}
      {phase === "recording" && (
        <div className="rounded-2xl bg-background chunky-border overflow-hidden h-20">
          <canvas
            ref={canvasRef}
            width={600}
            height={80}
            className="w-full h-full"
          />
        </div>
      )}

      {/* Review: audio playback */}
      {phase === "review" && (
        <div className="rounded-2xl bg-background p-4 chunky-border space-y-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Review your recording
          </p>
          <audio
            ref={audioRef}
            src={previewUrl ?? undefined}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
            >
              {playing ? (
                <Square className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <span className="text-sm font-bold text-muted-foreground">
              {formatTime(elapsed)} recorded
            </span>
          </div>
        </div>
      )}

      {/* Timer + progress bar (recording phase) */}
      {phase === "recording" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="tabular-nums">{formatTime(elapsed)}</span>
            <span
              className={`text-xs font-extrabold ${
                reachedTarget
                  ? "text-green-600"
                  : reachedMin
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {reachedTarget
                ? "✓ Great length — stop any time (max 15 min)"
                : reachedMin
                ? "Good — keep reading for a better clone"
                : `Keep reading — ${MIN_SECONDS - elapsed}s more (1 min minimum)`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted chunky-border">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                reachedTarget ? "bg-green-500" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Aiming for about {targetMinutes} minute{targetMinutes === 1 ? "" : "s"} — stop any time after 1 minute (up to 15).
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {phase === "idle" && (
          <>
            <button
              onClick={startRecording}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-extrabold text-primary-foreground text-sm chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform"
            >
              <Mic className="h-4 w-4" strokeWidth={2.5} />
              Start recording
            </button>
            <button
              onClick={onCancel}
              className="rounded-full bg-background px-5 py-2.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
            >
              Cancel
            </button>
          </>
        )}

        {phase === "recording" && (
          <button
            onClick={stopRecording}
            disabled={!reachedMin}
            className="flex items-center gap-2 rounded-full bg-destructive px-5 py-2.5 font-extrabold text-white text-sm chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:translate-y-0"
          >
            <Square className="h-4 w-4" strokeWidth={2.5} />
            {reachedMin ? "Stop recording" : `Wait ${MIN_SECONDS - elapsed}s…`}
          </button>
        )}

        {phase === "review" && (
          <>
            <button
              onClick={handleUseRecording}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-extrabold text-primary-foreground text-sm chunky-border chunky-shadow hover:-translate-y-0.5 transition-transform"
            >
              <Check className="h-4 w-4" strokeWidth={3} />
              Sounds good →
            </button>
            <button
              onClick={handleReRecord}
              className="flex items-center gap-2 rounded-full bg-background px-5 py-2.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.5} />
              Re-record
            </button>
          </>
        )}
      </div>
    </div>
  );
}
