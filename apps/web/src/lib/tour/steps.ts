import type { DriveStep } from "driver.js";

/**
 * Per-route tour steps. Each entry targets a real element via a
 * `data-tour="…"` attribute so the tour is decoupled from styling/markup.
 * A step with no `element` renders a centered popover (good for intros and for
 * pages that don't need a specific element highlighted).
 *
 * Two ways these run (see OnboardingProvider):
 *  1. Chained onboarding tour — the welcome modal's "Take the tour" walks the
 *     core creative journey: /create → /editor → /narrate → /studio → /reader.
 *  2. Per-page contextual tours — the FIRST time a signed-in user lands on any
 *     route below, its steps auto-run once (tracked per device), so every part
 *     of the app introduces itself. Re-openable from the "?" Help button.
 *
 * Premium note: narration, Parent mode (advanced design), and Voice Studio are
 * on paid plans. Their steps stay visible to everyone but say so plainly, so a
 * free user knows what's included before hitting the paywall.
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
          "Pick how your pictures look — watercolor, crayon, flat, or papercut. Scroll for more options.",
        side: "left",
      },
    },
    {
      element: '[data-tour="create-pagecount"]',
      popover: {
        title: "5. Page count",
        description:
          "Choose how long the book is — pick a preset or enter a custom number. Each written page uses one page from your monthly plan; the cover and back cover are free.",
        side: "left",
      },
    },
    {
      element: '[data-tour="create-enhance"]',
      popover: {
        title: "6. Generate your story",
        description:
          "When you're happy, click here. We'll imagine your idea, plan the book, and write the pages — you review and approve each stage before moving on.",
        side: "top",
      },
    },
  ],
  "/editor": [
    {
      popover: {
        title: "Draw your pictures 🎨",
        description:
          "This is where your storybook gets its pictures. Your characters are kept looking the same on every page.",
      },
    },
    {
      element: '[data-tour="editor-illustrate"]',
      popover: {
        title: "Make every picture",
        description:
          "One click makes pictures for the whole book — cover and back cover included. Not happy with a page? Remake just that one; your plan allows a set number of remakes per page.",
      },
    },
  ],
  "/narrate": [
    {
      popover: {
        title: "Add your voice 🎤",
        description:
          "Narrate your storybook so it can be read aloud with word-by-word highlighting. ✨ Narration is included on the Studio plan.",
      },
    },
    {
      element: '[data-tour="editor-narrate"]',
      popover: {
        title: "Narrate the book",
        description:
          "Pick a built-in voice — or your own cloned voice from Voice Studio — and narrate the whole book in one click.",
      },
    },
  ],
  "/studio": [
    {
      element: '[data-tour="studio-preview"]',
      popover: {
        title: "Design your pages 🖌️",
        description:
          "This is Parent mode — a live, print-accurate preview of the current page. Everything you change on the sides updates here instantly. ✨ Parent mode is included on the Storyteller and Studio plans.",
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
          "Flip through your finished storybook. Turn on narration to have it read aloud. Share a reading link or export a PDF whenever you're happy.",
      },
    },
  ],
  "/library": [
    {
      popover: {
        title: "My Library 📚",
        description:
          "Every book you make lives here. Open one to keep working on it, read it, or publish it.",
      },
    },
    {
      element: '[data-tour="library-tabs"]',
      popover: {
        title: "Find books fast",
        description:
          "Switch between all your books, ones set up to Read Myself or Read to Me, and In Progress — books you started but haven't finished illustrating yet.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="library-filter"]',
      popover: {
        title: "Filter by child",
        description:
          "Made books for more than one child? Filter the shelf to just one child's stories.",
        side: "left",
      },
    },
  ],
  "/profiles": [
    {
      popover: {
        title: "Child profiles 👶",
        description:
          "Set up a profile for each child — a name, an avatar, an age and interests. When you create a book you can pick a profile so the story is tailored to them, and the author name is filled in automatically.",
      },
    },
  ],
  "/voices": [
    {
      popover: {
        title: "Voice Studio 🎤",
        description:
          "Record or clone your own voice here, then choose it when you narrate a book — so the story can be read aloud in your voice. ✨ Voice Studio is part of the Studio plan.",
      },
    },
  ],
  "/kdp": [
    {
      popover: {
        title: "Publish 📖",
        description:
          "When your book is ready, prepare it for Amazon KDP — we draft the title, description, keywords and categories for you, and set up both cover formats KDP needs.",
      },
    },
  ],
  "/export": [
    {
      popover: {
        title: "Export & download 📄",
        description:
          "Download a print-ready Full Book PDF, an EPUB, or a Kindle cover — Standard (with your title and author) or Editor (a clean, textless image for the KDP cover tool).",
      },
    },
  ],
  "/canvas": [
    {
      popover: {
        title: "Fine-tune the text box ✍️",
        description:
          "Drag to place the text exactly where you want it on a page and resize the box. Great for getting the words to sit just right over the picture.",
      },
    },
  ],
  "/pricing": [
    {
      popover: {
        title: "Plans & pages 💛",
        description:
          "You have a pool of pages each month. Writing a page uses one; covers are free. Here's how the plans compare.",
      },
    },
    {
      element: '[data-tour="pricing-plans"]',
      popover: {
        title: "Choose a plan",
        description:
          "Free lets you try it out. Storyteller adds Parent mode and more pages. Studio adds AI narration, your own cloned voices, and avatars.",
        side: "top",
      },
    },
    {
      element: '[data-tour="pricing-topups"]',
      popover: {
        title: "Need more pages?",
        description:
          "Buy a prepaid page pack any time. Top-up pages never expire and are used after your monthly pool runs out — no need to change plans.",
        side: "top",
      },
    },
  ],
  "/account": [
    {
      popover: {
        title: "Your account 👤",
        description:
          "See your plan, how many pages you've used this period (including any top-ups), and manage or change your subscription here.",
      },
    },
  ],
};

export const TOUR_ROUTES = Object.keys(TOUR_STEPS);
