import type { DriveStep } from "driver.js";

/**
 * Per-route tour steps. Each entry targets a real element via a
 * `data-tour="…"` attribute so the tour is decoupled from styling/markup.
 * A step with no `element` renders a centered popover (good for intros).
 *
 * The tour is "chained": the user walks one page, performs the action the
 * final step describes, and the next page auto-runs its own steps while a tour
 * session is active.
 */
export const TOUR_STEPS: Record<string, DriveStep[]> = {
  "/create": [
    {
      element: '[data-tour="create-prompt"]',
      popover: {
        title: "1. Describe your story",
        description:
          "Type any idea here — a character, a lesson, or a silly scene. One sentence is plenty; we'll build out the rest.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="create-brainstorm"]',
      popover: {
        title: "Need ideas?",
        description:
          "Not sure what to write? Click Brainstorm and we'll suggest a few story hooks you can drop straight into the box.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="create-reading-level"]',
      popover: {
        title: "2. Reading level",
        description:
          "Choose the age group — it tunes the vocabulary, sentence length, and story complexity for your reader.",
        side: "left",
      },
    },
    {
      element: '[data-tour="create-themes"]',
      popover: {
        title: "3. Themes & tone",
        description:
          "Tap any themes that fit — funny, cozy, adventurous, and more. Add your own with the Custom field. Optional, but it shapes the mood.",
        side: "left",
      },
    },
    {
      element: '[data-tour="create-artstyle"]',
      popover: {
        title: "4. Art style",
        description:
          "Pick how your illustrations look — watercolor, crayon, flat, or papercut. Scroll for more options.",
        side: "left",
      },
    },
    {
      element: '[data-tour="create-pagecount"]',
      popover: {
        title: "5. Page count",
        description:
          "Choose how long the book is — pick a preset or enter a custom number. Shorter books are quicker to generate; longer ones tell a fuller story.",
        side: "left",
      },
    },
    {
      element: '[data-tour="create-enhance"]',
      popover: {
        title: "6. Generate your story",
        description:
          "When you're happy, click here. We'll expand your idea into a title, characters, and a page-by-page outline you can review before illustrating.",
        side: "top",
      },
    },
  ],
  "/editor": [
    {
      popover: {
        title: "Bring it to life 🎨",
        description: "This is where your outline becomes an illustrated, narrated book.",
      },
    },
    {
      element: '[data-tour="editor-illustrate"]',
      popover: {
        title: "Illustrate every page",
        description:
          "One click illustrates the whole book — cover included — keeping your characters consistent. You can Re-illustrate any single page too.",
      },
    },
    {
      element: '[data-tour="editor-narrate"]',
      popover: {
        title: "Add narration",
        description:
          "Pick a voice and narrate the whole book, so it can be read aloud in the reader with word-by-word highlighting.",
      },
    },
  ],
  "/studio": [
    {
      popover: {
        title: "Design the layout 🖌️",
        description:
          "Fine-tune text placement, fonts, and colors on each page — a live, print-accurate preview of your finished book.",
      },
    },
  ],
  "/reader": [
    {
      popover: {
        title: "Read your book 📖",
        description:
          "Flip through your finished storybook. Turn on narration to have it read aloud. Share it or export a PDF when you're happy.",
      },
    },
  ],
};

export const TOUR_ROUTES = Object.keys(TOUR_STEPS);
