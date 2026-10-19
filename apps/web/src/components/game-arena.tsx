"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Shared high-score hook ────────────────────────────────────────────────────
function useHigh(key: string) {
  const [high, setHigh] = useState(0);
  useEffect(() => { try { setHigh(Number(sessionStorage.getItem(key) || 0)); } catch {} }, [key]);
  const save = useCallback((s: number) => setHigh((h) => {
    const nh = Math.max(h, s);
    try { sessionStorage.setItem(key, String(nh)); } catch {}
    return nh;
  }), [key]);
  return [high, save] as const;
}

function Scoreboard({ score, high }: { score: number; high: number }) {
  return (
    <div className="mb-2 flex items-center justify-between text-sm font-extrabold">
      <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">Score {score}</span>
      <span className="rounded-full bg-highlight px-3 py-1 text-foreground">🏆 Best {high}</span>
    </div>
  );
}

function Overlay({ state, title, sub, onStart }: { state: "idle" | "running" | "over"; title: string; sub: string; onStart: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-center">
      <p className="font-display text-2xl font-black text-white drop-shadow">{title}</p>
      <p className="text-sm font-bold text-white drop-shadow">{sub}</p>
      <button onClick={onStart}
        className="mt-1 rounded-full bg-primary px-6 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">
        {state === "over" ? "Play again" : "Start"}
      </button>
    </div>
  );
}

// ── 1) Dino Dash — endless runner ─────────────────────────────────────────────
function DinoCanvas() {
  const W = 680, H = 240, GROUND_Y = H - 44, GRAVITY = 0.9, JUMP_V = -15.5;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "running" | "over">("idle");
  const [score, setScore] = useState(0);
  const [high, saveHigh] = useHigh("olivianx_dino_high");
  const g = useRef({ y: GROUND_Y, vy: 0, onGround: true, obs: [] as { x: number; w: number; h: number; e: string; s: number }[], clouds: [] as { x: number; y: number; s: number }[], speed: 6.5, dist: 0, spawn: 0, next: 55, raf: 0, running: false });

  const start = useCallback(() => {
    const s = g.current;
    s.y = GROUND_Y; s.vy = 0; s.onGround = true; s.obs = [];
    s.clouds = [{ x: W * 0.3, y: 46, s: 1 }, { x: W * 0.7, y: 78, s: 0.8 }, { x: W * 1.1, y: 40, s: 1.1 }];
    s.speed = 6.5; s.dist = 0; s.spawn = 0; s.next = 55; setScore(0); setState("running");
  }, [GROUND_Y]);
  const jump = useCallback(() => { const s = g.current; if (state === "running" && s.onGround) { s.vy = JUMP_V; s.onGround = false; } }, [state]);

  useEffect(() => {
    if (state !== "running") return;
    const ctx = canvasRef.current!.getContext("2d")!; const s = g.current; s.running = true; let sc = 0;
    const OB = ["🌵", "🌵", "🪨", "🍄"];
    function draw() {
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#bdecff"); sky.addColorStop(1, "#fff4d6");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffd93b"; ctx.beginPath(); ctx.arc(W - 70, 56, 26, 0, 7); ctx.fill();
      ctx.font = "34px serif"; ctx.textBaseline = "middle"; ctx.textAlign = "start";
      for (const c of s.clouds) ctx.fillText("☁️", c.x, c.y);
      ctx.fillStyle = "#7ecb3f"; ctx.fillRect(0, GROUND_Y + 20, W, H - GROUND_Y);
      ctx.strokeStyle = "#5aa42b"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, GROUND_Y + 22); ctx.lineTo(W, GROUND_Y + 22); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; const off = s.dist % 40;
      for (let x = -off; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 34); ctx.lineTo(x + 18, GROUND_Y + 34); ctx.stroke(); }
      for (const o of s.obs) { ctx.font = `${o.s}px serif`; ctx.fillText(o.e, o.x, GROUND_Y + 20 - o.h / 2); }
      ctx.font = "46px serif"; ctx.textAlign = "center"; ctx.save(); ctx.translate(70, s.y); ctx.scale(-1, 1); ctx.fillText("🦖", 0, 0); ctx.restore(); ctx.textAlign = "start";
    }
    function step() {
      if (!s.running) return;
      s.vy += GRAVITY; s.y += s.vy; if (s.y >= GROUND_Y) { s.y = GROUND_Y; s.vy = 0; s.onGround = true; }
      s.dist += s.speed; s.speed = 6.5 + Math.min(s.dist / 5000, 4.5);
      for (const c of s.clouds) { c.x -= s.speed * 0.25 * c.s; if (c.x < -40) { c.x = W + 40; c.y = 34 + Math.random() * 60; } }
      s.spawn++; if (s.spawn >= s.next) { s.spawn = 0; s.next = Math.max(52, 95 - s.dist / 1200) + Math.random() * 40; const sz = 34 + Math.round(Math.random() * 16); s.obs.push({ x: W + 20, w: sz * 0.55, h: sz, e: OB[Math.floor(Math.random() * OB.length)], s: sz }); }
      for (const o of s.obs) o.x -= s.speed; s.obs = s.obs.filter((o) => o.x > -60);
      sc++; if (sc % 3 === 0) setScore(Math.floor(sc / 3));
      const db = { x: 52, y: s.y - 32, w: 36, h: 32 };
      for (const o of s.obs) { const ob = { x: o.x + 4, y: GROUND_Y - o.h + 22, w: o.w, h: o.h - 8 }; if (db.x < ob.x + ob.w && db.x + db.w > ob.x && db.y < ob.y + ob.h && db.y + db.h > ob.y) { s.running = false; const f = Math.floor(sc / 3); setScore(f); saveHigh(f); setState("over"); draw(); return; } }
      draw(); s.raf = requestAnimationFrame(step);
    }
    draw(); s.raf = requestAnimationFrame(step);
    return () => { s.running = false; cancelAnimationFrame(s.raf); };
  }, [state, GROUND_Y, saveHigh]);

  useEffect(() => {
    if (state === "running") return; const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d")!;
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#bdecff"); sky.addColorStop(1, "#fff4d6"); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffd93b"; ctx.beginPath(); ctx.arc(W - 70, 56, 26, 0, 7); ctx.fill();
    ctx.fillStyle = "#7ecb3f"; ctx.fillRect(0, GROUND_Y + 20, W, H - GROUND_Y);
    ctx.font = "46px serif"; ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.save(); ctx.translate(70, GROUND_Y); ctx.scale(-1, 1); ctx.fillText("🦖", 0, 0); ctx.restore(); ctx.textAlign = "start";
  }, [state, GROUND_Y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); state === "running" ? jump() : start(); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [state, jump, start]);

  return (
    <div className="select-none">
      <Scoreboard score={score} high={high} />
      <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow-sm">
        <canvas ref={canvasRef} width={W} height={H} onMouseDown={() => (state === "running" ? jump() : start())} onTouchStart={(e) => { e.preventDefault(); state === "running" ? jump() : start(); }} className="block w-full cursor-pointer" style={{ touchAction: "none", aspectRatio: `${W} / ${H}` }} />
        {state !== "running" && <Overlay state={state} title={state === "over" ? "Game Over! 🎈" : "Dino Dash 🦖"} sub={state === "over" ? `You scored ${score}!` : "Hop over the cactus!"} onStart={start} />}
      </div>
      <p className="mt-2 text-center text-sm font-bold text-muted-foreground">🎮 Tap / click / press <span className="font-black text-foreground">Space</span> to jump.</p>
    </div>
  );
}

// ── 2) Space Shooter ──────────────────────────────────────────────────────────
function SpaceCanvas() {
  const W = 680, H = 340;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "running" | "over">("idle");
  const [score, setScore] = useState(0);
  const [high, saveHigh] = useHigh("olivianx_space_high");
  const g = useRef({ x: W / 2, bullets: [] as { x: number; y: number }[], enemies: [] as { x: number; y: number; sp: number; e: string }[], stars: [] as { x: number; y: number; s: number }[], spawn: 0, next: 45, fire: 0, raf: 0, running: false, tickspeed: 1 });

  const start = useCallback(() => {
    const s = g.current; s.x = W / 2; s.bullets = []; s.enemies = []; s.spawn = 0; s.next = 45; s.fire = 0; s.tickspeed = 1;
    s.stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 1.5 }));
    setScore(0); setState("running");
  }, []);

  useEffect(() => {
    if (state !== "running") return;
    const ctx = canvasRef.current!.getContext("2d")!; const s = g.current; s.running = true; let sc = 0;
    const EN = ["👾", "👽", "☄️", "🛸"];
    function draw() {
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a1140"); bg.addColorStop(1, "#3b1a63"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; for (const st of s.stars) { ctx.globalAlpha = st.s / 2; ctx.fillRect(st.x, st.y, st.s, st.s); } ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffe14d"; for (const b of s.bullets) { ctx.fillRect(b.x - 2, b.y, 4, 12); }
      ctx.font = "30px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const en of s.enemies) ctx.fillText(en.e, en.x, en.y);
      ctx.font = "36px serif"; ctx.save(); ctx.translate(s.x, H - 28); ctx.rotate(-Math.PI / 2); ctx.fillText("🚀", 0, 0); ctx.restore();
      ctx.textAlign = "start";
    }
    function step() {
      if (!s.running) return;
      for (const st of s.stars) { st.y += st.s; if (st.y > H) { st.y = 0; st.x = Math.random() * W; } }
      s.fire++; if (s.fire >= 12) { s.fire = 0; s.bullets.push({ x: s.x, y: H - 46 }); }
      for (const b of s.bullets) b.y -= 9; s.bullets = s.bullets.filter((b) => b.y > -12);
      s.spawn++; s.tickspeed = 1 + sc / 4000;
      if (s.spawn >= s.next) { s.spawn = 0; s.next = Math.max(22, 55 - sc / 200) + Math.random() * 25; s.enemies.push({ x: 30 + Math.random() * (W - 60), y: -20, sp: (1.6 + Math.random() * 1.4) * s.tickspeed, e: EN[Math.floor(Math.random() * EN.length)] }); }
      for (const en of s.enemies) en.y += en.sp;
      // bullet-enemy collisions
      for (const en of s.enemies) {
        for (const b of s.bullets) {
          if (Math.abs(b.x - en.x) < 20 && Math.abs(b.y - en.y) < 20) { en.y = H + 999; b.y = -999; sc += 10; setScore(sc); break; }
        }
      }
      s.enemies = s.enemies.filter((en) => en.y < H + 40);
      s.bullets = s.bullets.filter((b) => b.y > -20);
      // enemy reaches bottom or hits ship
      for (const en of s.enemies) {
        if (en.y > H - 44 && Math.abs(en.x - s.x) < 30) { s.running = false; saveHigh(sc); setState("over"); draw(); return; }
        if (en.y > H - 6) { s.running = false; saveHigh(sc); setState("over"); draw(); return; }
      }
      draw(); s.raf = requestAnimationFrame(step);
    }
    draw(); s.raf = requestAnimationFrame(step);
    return () => { s.running = false; cancelAnimationFrame(s.raf); };
  }, [state, saveHigh]);

  useEffect(() => {
    if (state === "running") return; const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d")!;
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a1140"); bg.addColorStop(1, "#3b1a63"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.font = "36px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.save(); ctx.translate(W / 2, H - 28); ctx.rotate(-Math.PI / 2); ctx.fillText("🚀", 0, 0); ctx.restore(); ctx.textAlign = "start";
  }, [state]);

  function move(clientX: number) {
    const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect();
    g.current.x = Math.max(20, Math.min(W - 20, ((clientX - r.left) / r.width) * W));
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state !== "running") { if (e.code === "Space") { e.preventDefault(); start(); } return; }
      if (e.code === "ArrowLeft") { e.preventDefault(); g.current.x = Math.max(20, g.current.x - 28); }
      if (e.code === "ArrowRight") { e.preventDefault(); g.current.x = Math.min(W - 20, g.current.x + 28); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [state, start]);

  return (
    <div className="select-none">
      <Scoreboard score={score} high={high} />
      <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow-sm">
        <canvas ref={canvasRef} width={W} height={H}
          onMouseMove={(e) => state === "running" && move(e.clientX)}
          onTouchMove={(e) => { e.preventDefault(); if (state === "running") move(e.touches[0].clientX); }}
          onMouseDown={() => state !== "running" && start()}
          onTouchStart={(e) => { e.preventDefault(); state !== "running" ? start() : move(e.touches[0].clientX); }}
          className="block w-full cursor-crosshair" style={{ touchAction: "none", aspectRatio: `${W} / ${H}` }} />
        {state !== "running" && <Overlay state={state} title={state === "over" ? "Game Over! 💥" : "Space Shooter 🚀"} sub={state === "over" ? `You scored ${score}!` : "Blast the aliens — auto-fires!"} onStart={start} />}
      </div>
      <p className="mt-2 text-center text-sm font-bold text-muted-foreground">🎮 Move your mouse / finger (or ← →) — it fires on its own!</p>
    </div>
  );
}

// ── 3) Kart Dash — Mario-Kart-style lane racer ────────────────────────────────
const KART_W = 680, KART_H = 360;
const KART_LANES = [KART_W * 0.28, KART_W * 0.5, KART_W * 0.72];
function KartCanvas() {
  const W = KART_W, H = KART_H, LANES = KART_LANES;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "running" | "over">("idle");
  const [score, setScore] = useState(0);
  const [high, saveHigh] = useHigh("olivianx_kart_high");
  const g = useRef({ lane: 1, x: LANES[1], items: [] as { lane: number; y: number; kind: "car" | "coin"; e: string }[], speed: 5, dist: 0, spawn: 0, next: 40, dash: 0, raf: 0, running: false });

  const start = useCallback(() => { const s = g.current; s.lane = 1; s.x = LANES[1]; s.items = []; s.speed = 5; s.dist = 0; s.spawn = 0; s.next = 40; s.dash = 0; setScore(0); setState("running"); }, [LANES]);
  const steer = useCallback((dir: -1 | 1) => { const s = g.current; if (state === "running") s.lane = Math.max(0, Math.min(2, s.lane + dir)); }, [state]);

  useEffect(() => {
    if (state !== "running") return;
    const ctx = canvasRef.current!.getContext("2d")!; const s = g.current; s.running = true; let sc = 0;
    const CARS = ["🚗", "🚙", "🚕", "🚚", "🚧"];
    function draw() {
      ctx.fillStyle = "#5aa42b"; ctx.fillRect(0, 0, W, H); // grass
      const roadX = W * 0.16, roadW = W * 0.68;
      ctx.fillStyle = "#4a4a55"; ctx.fillRect(roadX, 0, roadW, H); // road
      ctx.fillStyle = "#f4d03f"; ctx.fillRect(roadX - 6, 0, 6, H); ctx.fillRect(roadX + roadW, 0, 6, H); // edges
      ctx.fillStyle = "rgba(255,255,255,0.85)"; const off = s.dist % 60;
      for (const lx of [W * 0.39, W * 0.61]) for (let y = -off; y < H; y += 60) ctx.fillRect(lx - 3, y, 6, 34); // lane dashes
      ctx.font = "34px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const it of s.items) ctx.fillText(it.e, LANES[it.lane], it.y);
      // player kart (smooth lane lerp)
      s.x += (LANES[s.lane] - s.x) * 0.25;
      ctx.font = "40px serif"; ctx.fillText("🏎️", s.x, H - 46);
      ctx.textAlign = "start";
    }
    function step() {
      if (!s.running) return;
      s.dist += s.speed; s.speed = 5 + Math.min(s.dist / 6000, 4);
      s.spawn++; if (s.spawn >= s.next) { s.spawn = 0; s.next = Math.max(28, 60 - s.dist / 1500) + Math.random() * 24; const lane = Math.floor(Math.random() * 3); const coin = Math.random() < 0.35; s.items.push({ lane, y: -24, kind: coin ? "coin" : "car", e: coin ? "🪙" : CARS[Math.floor(Math.random() * CARS.length)] }); }
      for (const it of s.items) it.y += s.speed;
      // collisions with player at bottom
      for (const it of s.items) {
        if (it.y > H - 66 && it.y < H - 26 && it.lane === s.lane) {
          if (it.kind === "coin") { it.y = H + 999; sc += 25; setScore(sc); }
          else { s.running = false; saveHigh(sc); setState("over"); draw(); return; }
        }
      }
      s.items = s.items.filter((it) => it.y < H + 40);
      sc += 1; if (sc % 5 === 0) setScore(sc);
      draw(); s.raf = requestAnimationFrame(step);
    }
    draw(); s.raf = requestAnimationFrame(step);
    return () => { s.running = false; cancelAnimationFrame(s.raf); };
  }, [state, LANES, saveHigh]);

  useEffect(() => {
    if (state === "running") return; const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#5aa42b"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#4a4a55"; ctx.fillRect(W * 0.16, 0, W * 0.68, H);
    ctx.font = "40px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🏎️", LANES[1], H - 46); ctx.textAlign = "start";
  }, [state, LANES]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state !== "running") { if (e.code === "Space") { e.preventDefault(); start(); } return; }
      if (e.code === "ArrowLeft") { e.preventDefault(); steer(-1); }
      if (e.code === "ArrowRight") { e.preventDefault(); steer(1); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [state, steer, start]);

  function tap(clientX: number) {
    if (state !== "running") { start(); return; }
    const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect();
    steer((clientX - r.left) < r.width / 2 ? -1 : 1);
  }

  return (
    <div className="select-none">
      <Scoreboard score={score} high={high} />
      <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow-sm">
        <canvas ref={canvasRef} width={W} height={H}
          onMouseDown={(e) => tap(e.clientX)} onTouchStart={(e) => { e.preventDefault(); tap(e.touches[0].clientX); }}
          className="block w-full cursor-pointer" style={{ touchAction: "none", aspectRatio: `${W} / ${H}` }} />
        {state !== "running" && <Overlay state={state} title={state === "over" ? "Crash! 💥" : "Kart Dash 🏎️"} sub={state === "over" ? `You scored ${score}!` : "Dodge cars, grab coins!"} onStart={start} />}
      </div>
      <p className="mt-2 text-center text-sm font-bold text-muted-foreground">🎮 Tap left / right side (or ← →) to switch lanes. Grab 🪙, dodge 🚗!</p>
    </div>
  );
}

// ── 4) Butterfly Catch — tap the butterflies, avoid the bee ───────────────────
function ButterflyCatch() {
  const W = 680, H = 340;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "running" | "over">("idle");
  const [score, setScore] = useState(0);
  const [high, saveHigh] = useHigh("olivianx_butterfly_high");
  const g = useRef({ items: [] as { x: number; y: number; vx: number; vy: number; e: string; bad: boolean; t: number; caught: boolean }[], spawn: 0, next: 26, raf: 0, running: false, sc: 0 });

  const start = useCallback(() => { const s = g.current; s.items = []; s.spawn = 0; s.next = 26; s.sc = 0; setScore(0); setState("running"); }, []);

  useEffect(() => {
    if (state !== "running") return;
    const ctx = canvasRef.current!.getContext("2d")!; const s = g.current; s.running = true;
    const BF = ["🦋", "🦋", "🦋", "🐛", "🌸"];
    function draw() {
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#d7f5e3"); sky.addColorStop(1, "#fff4d6");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const it of s.items) { ctx.font = "40px serif"; ctx.globalAlpha = it.caught ? 0.35 : 1; ctx.fillText(it.e, it.x, it.y); }
      ctx.globalAlpha = 1;
    }
    function step() {
      if (!s.running) return;
      s.spawn++; if (s.spawn >= s.next) {
        s.spawn = 0; s.next = 24 + Math.random() * 28;
        const bad = Math.random() < 0.18; const fromLeft = Math.random() < 0.5; const y = 40 + Math.random() * (H - 80);
        s.items.push({ x: fromLeft ? -30 : W + 30, y, vx: (fromLeft ? 1 : -1) * (1.6 + Math.random() * 1.9), vy: (Math.random() - 0.5) * 1.2, e: bad ? "🐝" : BF[Math.floor(Math.random() * BF.length)], bad, t: 0, caught: false });
      }
      for (const it of s.items) { it.x += it.vx; it.y += it.vy + Math.sin(it.t / 12) * 0.6; it.t++; if (it.y < 24) it.y = 24; if (it.y > H - 24) it.y = H - 24; }
      s.items = s.items.filter((it) => it.x > -50 && it.x < W + 50 && !it.caught);
      draw(); s.raf = requestAnimationFrame(step);
    }
    draw(); s.raf = requestAnimationFrame(step);
    return () => { s.running = false; cancelAnimationFrame(s.raf); };
  }, [state, saveHigh]);

  useEffect(() => {
    if (state === "running") return; const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d")!;
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#d7f5e3"); sky.addColorStop(1, "#fff4d6"); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.font = "60px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🦋", W / 2, H / 2);
  }, [state]);

  const tap = (clientX: number, clientY: number) => {
    if (state !== "running") { start(); return; }
    const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W, y = ((clientY - r.top) / r.height) * H; const s = g.current;
    for (const it of s.items) {
      if (it.caught) continue;
      if (Math.abs(it.x - x) < 36 && Math.abs(it.y - y) < 36) {
        if (it.bad) { s.running = false; saveHigh(s.sc); setState("over"); return; }
        it.caught = true; s.sc++; setScore(s.sc); break;
      }
    }
  };

  return (
    <div className="select-none">
      <Scoreboard score={score} high={high} />
      <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow-sm">
        <canvas ref={canvasRef} width={W} height={H}
          onMouseDown={(e) => tap(e.clientX, e.clientY)}
          onTouchStart={(e) => { e.preventDefault(); const t = e.touches[0]; tap(t.clientX, t.clientY); }}
          className="block w-full cursor-pointer" style={{ touchAction: "none", aspectRatio: `${W} / ${H}` }} />
        {state !== "running" && <Overlay state={state} title={state === "over" ? "Oops! 🐝" : "Butterfly Catch 🦋"} sub={state === "over" ? `You caught ${score}!` : "Tap butterflies — avoid the bee!"} onStart={start} />}
      </div>
      <p className="mt-2 text-center text-sm font-bold text-muted-foreground">🦋 Tap the butterflies to catch them. Don&apos;t tap the 🐝!</p>
    </div>
  );
}

// ── 5) Ice Cream Stacker — drop scoops in line ────────────────────────────────
function IceCreamStacker() {
  const W = 680, H = 360;
  const SCOOP_W = 100, SCOOP_H = 32, TOL = 56, TOP_Y = 78;
  const COLORS = ["#ff9ecb", "#7BDFAC", "#FFDC4C", "#c98a5e", "#59C5F5", "#ffb37b"];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "running" | "over">("idle");
  const [score, setScore] = useState(0);
  const [high, saveHigh] = useHigh("olivianx_icecream_high");
  const g = useRef({ stack: [W / 2] as number[], ax: 120, dir: 1, speed: 3.2, raf: 0, running: false });

  const start = useCallback(() => { const s = g.current; s.stack = [W / 2]; s.ax = 120; s.dir = 1; s.speed = 3.2; setScore(0); setState("running"); }, []);

  useEffect(() => {
    if (state !== "running") return;
    const ctx = canvasRef.current!.getContext("2d")!; const s = g.current; s.running = true;
    function roundRect(cx: number, cy: number, w: number, color: string) {
      const x = cx - w / 2, y = cy - SCOOP_H / 2, rad = 12;
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + SCOOP_H, rad); ctx.arcTo(x + w, y + SCOOP_H, x, y + SCOOP_H, rad);
      ctx.arcTo(x, y + SCOOP_H, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(19,32,62,0.35)"; ctx.lineWidth = 2; ctx.stroke();
    }
    function draw() {
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#fde4f0"); sky.addColorStop(1, "#e9f8ff");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const n = s.stack.length;
      // cone below the base scoop
      const coneY = TOP_Y + (n + 1) * SCOOP_H;
      const baseX = s.stack[0];
      ctx.fillStyle = "#e0a15a"; ctx.beginPath(); ctx.moveTo(baseX - 34, coneY - SCOOP_H / 2); ctx.lineTo(baseX + 34, coneY - SCOOP_H / 2); ctx.lineTo(baseX, coneY + 46); ctx.closePath(); ctx.fill();
      // placed scoops (bottom → top)
      for (let i = 0; i < n; i++) { const y = TOP_Y + (n - i) * SCOOP_H; roundRect(s.stack[i], y, SCOOP_W, COLORS[i % COLORS.length]); }
      // active moving scoop
      roundRect(s.ax, TOP_Y, SCOOP_W, COLORS[n % COLORS.length]);
      ctx.font = "26px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🍒", s.ax, TOP_Y - SCOOP_H / 2 - 4);
    }
    function step() {
      if (!s.running) return;
      s.ax += s.dir * s.speed;
      const lo = SCOOP_W / 2 + 12, hi = W - SCOOP_W / 2 - 12;
      if (s.ax < lo) { s.ax = lo; s.dir = 1; } if (s.ax > hi) { s.ax = hi; s.dir = -1; }
      draw(); s.raf = requestAnimationFrame(step);
    }
    draw(); s.raf = requestAnimationFrame(step);
    return () => { s.running = false; cancelAnimationFrame(s.raf); };
  }, [state]);

  useEffect(() => {
    if (state === "running") return; const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d")!;
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#fde4f0"); sky.addColorStop(1, "#e9f8ff"); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.font = "70px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🍦", W / 2, H / 2);
  }, [state]);

  const drop = () => {
    if (state !== "running") { start(); return; }
    const s = g.current; const topx = s.stack[s.stack.length - 1];
    if (Math.abs(s.ax - topx) <= TOL) { s.stack.push(s.ax); s.speed = Math.min(7.5, s.speed + 0.35); setScore(s.stack.length - 1); }
    else { s.running = false; saveHigh(s.stack.length - 1); setState("over"); }
  };

  return (
    <div className="select-none">
      <Scoreboard score={score} high={high} />
      <div className="relative overflow-hidden rounded-2xl chunky-border chunky-shadow-sm">
        <canvas ref={canvasRef} width={W} height={H}
          onMouseDown={drop} onTouchStart={(e) => { e.preventDefault(); drop(); }}
          className="block w-full cursor-pointer" style={{ touchAction: "none", aspectRatio: `${W} / ${H}` }} />
        {state !== "running" && <Overlay state={state} title={state === "over" ? "Toppled! 🍨" : "Ice Cream Stacker 🍦"} sub={state === "over" ? `${score} scoops high!` : "Tap to drop each scoop in line!"} onStart={start} />}
      </div>
      <p className="mt-2 text-center text-sm font-bold text-muted-foreground">🍦 Tap to drop a scoop. Keep them lined up to build a tall cone!</p>
    </div>
  );
}

// ── 6) Memory Match — find the matching pairs ─────────────────────────────────
const MEMORY_EMOJIS = ["🦄", "🌈", "🍩", "🐸", "⭐", "🚀", "🦋", "🍦"];
function MemoryMatch() {
  const [cards, setCards] = useState<{ e: string; flipped: boolean; matched: boolean }[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const [lock, setLock] = useState(false);
  const [best, setBest] = useState(0);

  const deal = useCallback(() => {
    const deck = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS]
      .map((e) => ({ e, flipped: false, matched: false, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map(({ e, flipped, matched }) => ({ e, flipped, matched }));
    setCards(deck); setFlipped([]); setMoves(0); setWon(false); setLock(false);
  }, []);

  useEffect(() => { deal(); try { setBest(Number(sessionStorage.getItem("olivianx_memory_best") || 0)); } catch {} }, [deal]);

  const flip = (idx: number) => {
    if (lock || won) return;
    const c = cards[idx]; if (!c || c.flipped || c.matched) return;
    const nf = [...flipped, idx];
    setCards((cs) => cs.map((x, i) => (i === idx ? { ...x, flipped: true } : x)));
    setFlipped(nf);
    if (nf.length === 2) {
      setMoves((m) => m + 1); setLock(true);
      const [a, b] = nf;
      if (cards[a].e === cards[b].e) {
        setTimeout(() => { setCards((cs) => cs.map((x, i) => (i === a || i === b ? { ...x, matched: true } : x))); setFlipped([]); setLock(false); }, 420);
      } else {
        setTimeout(() => { setCards((cs) => cs.map((x, i) => (i === a || i === b ? { ...x, flipped: false } : x))); setFlipped([]); setLock(false); }, 780);
      }
    }
  };

  useEffect(() => {
    if (cards.length && cards.every((c) => c.matched) && !won) {
      setWon(true);
      setBest((prev) => { const nb = prev === 0 ? moves : Math.min(prev, moves); try { sessionStorage.setItem("olivianx_memory_best", String(nb)); } catch {} return nb; });
    }
  }, [cards, won, moves]);

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between text-sm font-extrabold">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">Moves {moves}</span>
        {best > 0 && <span className="rounded-full bg-highlight px-3 py-1 text-foreground">🏆 Best {best}</span>}
        <button onClick={deal} className="rounded-full bg-background px-3 py-1 chunky-border hover:-translate-y-0.5 transition-transform">Shuffle 🔀</button>
      </div>
      <div className="relative grid grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <button key={i} onClick={() => flip(i)} disabled={c.matched}
            className={`grid aspect-square place-items-center rounded-2xl text-4xl md:text-5xl chunky-border transition-transform ${
              c.matched ? "bg-accent/40 opacity-70" : c.flipped ? "bg-card" : "bg-secondary/30 hover:-translate-y-0.5"
            }`}>
            {c.flipped || c.matched ? c.e : "❓"}
          </button>
        ))}
        {won && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/40 text-center">
            <p className="font-display text-2xl font-black text-white drop-shadow">You matched them all! 🎉</p>
            <p className="text-sm font-bold text-white drop-shadow">Finished in {moves} moves</p>
            <button onClick={deal} className="mt-1 rounded-full bg-primary px-6 py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform">Play again</button>
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-sm font-bold text-muted-foreground">🧠 Flip two cards to find matching pairs. Match them all!</p>
    </div>
  );
}

// ── Arena: game picker + selected game ────────────────────────────────────────
type GameId = "dino" | "space" | "kart" | "butterfly" | "icecream" | "memory";
const GAMES: { id: GameId; name: string; emoji: string; color: string }[] = [
  { id: "dino", name: "Dino Dash", emoji: "🦖", color: "bg-primary/10 text-primary" },
  { id: "space", name: "Space Shooter", emoji: "🚀", color: "bg-accent/20 text-accent-foreground" },
  { id: "kart", name: "Kart Dash", emoji: "🏎️", color: "bg-highlight text-foreground" },
  { id: "butterfly", name: "Butterfly Catch", emoji: "🦋", color: "bg-secondary/25 text-foreground" },
  { id: "icecream", name: "Ice Cream Stacker", emoji: "🍦", color: "bg-primary/10 text-primary" },
  { id: "memory", name: "Memory Match", emoji: "🧠", color: "bg-accent/20 text-accent-foreground" },
];

export function GameArena() {
  const [game, setGame] = useState<null | GameId>(null);

  if (!game) {
    return (
      <div>
        <p className="mb-4 text-lg font-bold text-muted-foreground">Pick a game to pass the time 👇</p>
        <div className="grid grid-cols-3 gap-4">
          {GAMES.map((gm) => (
            <button key={gm.id} onClick={() => setGame(gm.id)}
              className={`flex flex-col items-center gap-2.5 rounded-2xl p-6 chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform ${gm.color}`}>
              <span className="text-6xl">{gm.emoji}</span>
              <span className="text-base font-extrabold text-center leading-tight">{gm.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setGame(null)} className="mb-3 inline-flex items-center gap-1 rounded-full bg-background px-4 py-1.5 text-sm font-extrabold chunky-border hover:-translate-y-0.5 transition-transform">
        ← All games
      </button>
      {game === "dino" && <DinoCanvas />}
      {game === "space" && <SpaceCanvas />}
      {game === "kart" && <KartCanvas />}
      {game === "butterfly" && <ButterflyCatch />}
      {game === "icecream" && <IceCreamStacker />}
      {game === "memory" && <MemoryMatch />}
    </div>
  );
}
