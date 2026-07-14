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
      popover: {
        title: "Let's make your first book ✦",
        description:
          "I'll walk you through it. You describe an idea, we turn it into a story, then illustrate and narrate it. Click Next.",
      },
    },
    {
      element: '[data-tour="create-prompt"]',
      popover: {
        title: "1. Describe your story",
        description:
          "Type any idea — a character, a lesson, a silly scene. A sentence or two is plenty. Stuck? Use Brainstorm for ideas.",
      },
    },
    {
      element: '[data-tour="create-options"]',
      popover: {
        title: "2. Set the details",
        description:
          "Pick the reading age, a few themes, an art style, and how many pages. The safety toggle keeps content kid-friendly.",
      },
    },
    {
      element: '[data-tour="create-enhance"]',
      popover: {
        title: "3. Generate the story",
        description:
          "This writes a title, characters, and a page-by-page outline you can review and tweak before illustrating.",
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
