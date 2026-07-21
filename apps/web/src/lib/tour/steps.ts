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
      element: '[data-tour="studio-preview"]',
      popover: {
        title: "Design your pages 🖌️",
        description:
          "This is a live, print-accurate preview of the current page. Everything you change on the sides updates here instantly. Use the arrows to move between pages.",
        side: "left",
      },
    },
    {
      element: '[data-tour="studio-text"]',
      popover: {
        title: "Edit the page text",
        description:
          "Tweak the wording for this page right here — fix a typo or reword a line without regenerating anything.",
        side: "right",
      },
    },
    {
      element: '[data-tour="studio-layout"]',
      popover: {
        title: "Choose the layout",
        description:
          "Pick how the picture and text sit together — text over the picture, or picture with the text below. The “+” options let you fine-tune the text-area size.",
        side: "right",
      },
    },
    {
      element: '[data-tour="studio-font"]',
      popover: {
        title: "Fonts, size & colors",
        description:
          "Set the font, size, text color, and the text-area color. These apply across the whole book so it stays consistent.",
        side: "left",
      },
    },
    {
      element: '[data-tour="studio-actions"]',
      popover: {
        title: "Preview, narrate & export",
        description:
          "When it looks right, Preview it in the reader, add Narration, or Export a print-ready PDF.",
        side: "bottom",
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
  "/voices": [
    {
      popover: {
        title: "Voice Studio 🎤",
        description:
          "Record or clone your own voice here, then choose it when you narrate a book — so the story can be read aloud in your voice.",
      },
    },
  ],
  "/kdp": [
    {
      popover: {
        title: "Publish 📖",
        description:
          "When your book is ready, export a print-ready PDF or prepare it for Amazon KDP — title, description, and cover all set up for you.",
      },
    },
  ],
};

export const TOUR_ROUTES = Object.keys(TOUR_STEPS);
