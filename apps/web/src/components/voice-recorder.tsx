"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Square, RotateCcw, Check } from "lucide-react";

// ── Sample script shown to the user while recording ──────────────────────────

export const RECORDING_SCRIPT = `Once upon a time, in a little house at the edge of a great forest, there lived a young girl named Mara. Every morning, she would wake up before the sun and run to the window to watch the deer drink from the stream below.

One Tuesday — she remembered it was Tuesday because she'd had porridge for breakfast — she spotted something unusual. A small fox with a bright orange tail was sitting at the edge of the water, looking up at her window with curious, golden eyes.

"Hello there," she whispered, so as not to frighten it.

The fox tilted its head. Then it did something extraordinary: it sat down, wrapped its tail neatly around its paws, and waited.

Mara ran downstairs, grabbed a piece of bread from the kitchen table, and slipped out the back door. The morning air was cold and sweet. She held out her hand — slowly, slowly — until she felt the warmth of the fox's nose against her palm.

From that day on, they were the very best of friends.`;

const MIN_SECONDS = 30;
const TARGET_SECONDS = 60;

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
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

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

        // Create URL for playback
        if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = URL.createObjectURL(finalBlob);
        if (audioRef.current) audioRef.current.src = audioBlobUrlRef.current;

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
    if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    audioBlobUrlRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setPlaying(false);
  }

  function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  function handleUseRecording() {
    if (blob) onComplete(blob);
  }

  // Progress indicator
  const pct = Math.min((elapsed / TARGET_SECONDS) * 100, 100);
  const reachedMin = elapsed >= MIN_SECONDS;
  const reachedTarget = elapsed >= TARGET_SECONDS;

  return (
    <div className="space-y-5">
      {/* Script panel */}
      {phase !== "review" && (
        <div className="rounded-2xl bg-background p-4 chunky-border">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2">
            Read this aloud
          </p>
          <p className="text-sm leading-loose whitespace-pre-line text-foreground/90">
            {RECORDING_SCRIPT}
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
                ? "✓ Great length!"
                : reachedMin
                ? "Good — keep reading for better quality"
                : `Keep reading — ${MIN_SECONDS - elapsed}s more`}
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
            Aim for ~60 seconds — the more you read, the better the clone sounds
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
