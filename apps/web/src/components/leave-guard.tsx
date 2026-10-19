"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Warns before the user navigates away (in-app link click or tab close) while a
 * generation step is running. Mirrors the create page's "leave while it
 * finishes" flow: progress so far is saved and resumable, so leaving is allowed
 * — we just confirm first. Buttons that navigate via router.push aren't
 * intercepted (only anchor/Link clicks are), so forward actions aren't blocked.
 */
export function LeaveGuard({
  active,
  title,
  message,
  subMessage,
  leaveFallback = "/library?tab=progress",
}: {
  active: boolean;
  title: string;
  message: string;
  subMessage?: string;
  leaveFallback?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (activeRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!activeRef.current) return;
      const a = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || a.target === "_blank" || href.startsWith("http")) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  // Dismiss the prompt if the step finishes while it's open.
  useEffect(() => { if (!active) setPending(null); }, [active]);

  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center chunky-border chunky-shadow">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-highlight chunky-border text-3xl">✨</div>
        <h2 className="font-display text-2xl font-black">{title}</h2>
        <p className="mt-2 text-sm font-bold text-foreground/80">{message}</p>
        {subMessage && <p className="mt-2 text-xs text-muted-foreground">{subMessage}</p>}
        <button
          onClick={() => setPending(null)}
          className="mt-5 w-full rounded-full bg-primary py-2.5 text-sm font-extrabold text-primary-foreground chunky-border chunky-shadow-sm hover:-translate-y-0.5 transition-transform"
        >
          Keep watching
        </button>
        <button
          onClick={() => { const href = pending; setPending(null); router.push(href || leaveFallback); }}
          className="mt-2 w-full rounded-full bg-background py-2.5 text-sm font-extrabold text-muted-foreground chunky-border hover:-translate-y-0.5 transition-transform"
        >
          Leave — finish in background
        </button>
      </div>
    </div>
  );
}
