import { useState, useEffect } from "react";

export function useRelativeTime(iso: string | null | undefined): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!iso) return;

    function compute() {
      const diff = Date.now() - new Date(iso!).getTime();
      if (diff < 10_000) return "just now";
      if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
      return new Date(iso!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    setLabel(compute());
    const id = setInterval(() => setLabel(compute()), 15_000);
    return () => clearInterval(id);
  }, [iso]);

  return label;
}
