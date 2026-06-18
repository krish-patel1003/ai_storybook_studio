"use client";

import { useState, useEffect, useRef } from "react";

export function useCyclingMessage(messages: string[], intervalMs = 2400): string {
  const [idx, setIdx] = useState(0);
  const shuffled = useRef<string[]>([]);

  useEffect(() => {
    shuffled.current = [...messages].sort(() => Math.random() - 0.5);
    setIdx(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % (shuffled.current.length || 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return shuffled.current[idx] ?? messages[0] ?? "";
}
