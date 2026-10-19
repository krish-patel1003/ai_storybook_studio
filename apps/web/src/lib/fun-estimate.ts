// Measured actual per-stage times, tuned against real runs (a 15-page book's
// pictures take ~4 min end-to-end, so image gen behaves closer to sequential once
// character sheets, retries, uploads and rate-limits are counted in).
export function estimateIllustrationSeconds(pageCount: number): number {
  return Math.round(20 + pageCount * 15);
}

export function estimateNarrationSeconds(pageCount: number): number {
  return Math.round(8 + pageCount * 12); // narration runs one page at a time (~12s each)
}

export function estimateWritingSeconds(pageCount: number): number {
  return Math.round(35 + pageCount * 3);
}

// Always over-estimate: measured actual + a flat 2-minute buffer.
export function conservativeSeconds(actual: number): number {
  return actual + 120;
}

// A single, clear, conservative number, e.g. "about 6 minutes".
export function estimateLabel(actual: number): string {
  const cons = conservativeSeconds(actual);
  if (cons <= 45) return "about 30 seconds";
  if (cons < 90) return "about 1 minute";
  return `about ${Math.round(cons / 60)} minutes`;
}
