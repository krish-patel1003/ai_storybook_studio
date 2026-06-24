/**
 * Shared font definitions used by the reader and export pages.
 * Each entry has:
 *   id        – stable identifier (matches backend font IDs)
 *   label     – human-readable name shown in pickers
 *   stack     – CSS font-family value (must match a loaded Google Font)
 *   weight    – default font-weight to use for story text
 *   sample    – short preview string shown in pickers
 */

export const READER_FONTS = [
  { id: "unkempt",       label: "Unkempt",       stack: 'var(--font-unkempt), cursive',        weight: 400, sample: "Aa" },
  { id: "mochibop",      label: "Mochibop",       stack: 'var(--font-mochibop), sans-serif',    weight: 400, sample: "Aa" },
  { id: "fredoka",       label: "Fredoka",        stack: '"Fredoka", sans-serif',               weight: 700, sample: "Aa" },
  { id: "nunito",        label: "Nunito",         stack: 'var(--font-nunito), sans-serif',       weight: 600, sample: "Aa" },
  { id: "patrick-hand",  label: "Patrick Hand",   stack: 'var(--font-patrick-hand), cursive',   weight: 400, sample: "Aa" },
  { id: "caveat",        label: "Caveat",         stack: 'var(--font-caveat), cursive',          weight: 700, sample: "Aa" },
  { id: "merriweather",  label: "Merriweather",   stack: 'var(--font-merriweather), serif',      weight: 700, sample: "Aa" },
  { id: "quicksand",     label: "Quicksand",      stack: 'var(--font-quicksand), sans-serif',    weight: 600, sample: "Aa" },
] as const;

export type FontId = typeof READER_FONTS[number]["id"];
