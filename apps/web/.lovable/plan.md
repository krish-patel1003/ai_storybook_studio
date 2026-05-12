
# Storybook Studio — UI Plan

A bright, playful, kid-book-flavored interface for an AI tool that turns one prompt into a 10–15 page illustrated children's book. UI only (mocked data, no backend yet).

## Design language

- **Vibe:** Playful & bold — chunky rounded shapes, thick borders, soft drop shadows, sticker-like buttons.
- **Palette (semantic tokens in `src/styles.css`, oklch):**
  - `--background`: warm cream
  - `--primary`: sunny coral/orange
  - `--secondary`: sky blue
  - `--accent`: mint green
  - `--highlight`: buttercup yellow
  - `--ink`: deep navy (foreground)
- **Typography:** Display font *Fraunces* (chunky serif) for headings + *Nunito* for body — both Google Fonts.
- **Motion:** framer-motion for page-turn, sticker bounce on buttons, fade/slide between wizard steps.
- **Components:** shadcn (Button, Card, Dialog, Tabs, Tooltip, Slider, Textarea, Input, Sheet, Progress, Badge).

## Routes (TanStack Start, separate files)

```
src/routes/
  __root.tsx        – global header (logo, nav, "New book" CTA)
  index.tsx         – landing page
  create.tsx        – prompt → brief wizard
  outline.tsx       – page-by-page outline editor
  editor.tsx        – main book editor (two-pane + top bar)
  reader.tsx        – interactive reader preview
  export.tsx        – export / publish screen
```

Each route gets its own `head()` metadata.

## Screen-by-screen

### 1. Landing (`/`)
- Hero: huge display heading "Turn one idea into a storybook.", subcopy, primary CTA "Start your story", secondary "See an example".
- Floating illustrated stickers (animated bobbing).
- 3-step "How it works" cards: Prompt → Illustrate → Publish.
- Sample book carousel (mock covers).
- Footer.

### 2. Create wizard (`/create`)
- Centered card, progress dots at top (4 steps).
- Step 1 — **Prompt:** big textarea ("A brave little fox who learns to share…"), example chips.
- Step 2 — **Brief:** auto-filled fields (Title, Theme, Setting, Main character, Lesson) — editable.
- Step 3 — **Audience:** reading level slider (Ages 3–5 / 6–8 / 9–11), tone toggles (Funny, Calm, Adventurous), safety switch.
- Step 4 — **Style:** illustration style picker (watercolor, flat, crayon, papercut) as image tiles.
- "Generate outline" CTA → `/outline`.

### 3. Outline (`/outline`)
- Vertical list of 10–12 page cards: page #, one-line scene description, regenerate icon.
- Drag-handle to reorder; inline edit; "+ add page" button.
- Right side: character roster preview (chips with portrait placeholders + locked-trait badges).
- "Looks good — illustrate it" CTA → `/editor`.

### 4. Editor (`/editor`) — **main screen, two-pane + top bar**
- **Top bar:** book title (inline editable), step indicator, autosave dot, "Preview" button, "Export" button.
- **Left pane (260px):** vertical page thumbnails (image + page #), active state highlighted, cover at top, "+ page" at bottom.
- **Right pane (fluid):** large page preview — illustration on top, story text below, framed like a book page.
  - Floating action toolbar (right edge): Regenerate image, Edit text, Edit prompt, Lock character, Variations, Delete.
  - Below preview: collapsible **Characters** strip (reference sheets, locked traits, "regenerate consistent set").
  - Right-side drawer (Sheet) for "Edit text" with rich textarea + reading-level meter, and "Edit image" with prompt + style + seed lock.

### 5. Reader (`/reader`)
- Full-bleed cream background; centered book spread (two-page layout) with page-turn animation (framer-motion).
- Bottom controls: prev/next, page indicator, "Read aloud" toggle (mock), exit to editor.

### 6. Export (`/export`)
- Three big choice cards: **Interactive link**, **PDF**, **EPUB (Kindle-ready)**.
- Right-side live preview thumbnail + checklist (cover ✓, 12 pages ✓, character sheet ✓).
- "Download" / "Copy share link" buttons; success confetti via framer-motion.

## Shared components

- `BookHeader` – logo + nav + CTA, used in `__root.tsx`.
- `StickerButton` – primary CTA variant (chunky shadow, hover bounce).
- `PageThumb`, `PageCanvas`, `CharacterChip`, `RegenPopover`, `StyleTile`, `StepDots`.
- All colors via tokens — no hardcoded hex in components.

## Mock data

- `src/lib/mock-book.ts` exporting a sample book (title, 10 pages with placeholder image URLs from `picsum.photos` / generated assets, 2 characters, style="watercolor").

## Generated assets (imagegen, fast tier)

- 1 hero illustration (landing) — playful animals reading a book
- 1 cover illustration for sample book
- 3 sample interior page illustrations (reused as thumbnails across editor/reader)
- 2 character reference portraits

## Out of scope (UI only for now)

- Real AI generation, real PDF/EPUB rendering, auth, persistence — all mocked. Lovable Cloud not enabled in this pass.

## Acceptance

- All 6 routes navigable from header + CTAs.
- Editor shows two-pane layout with working page selection (local state), regenerate/edit drawers open, character strip toggles.
- Reader animates page turns over mock pages.
- Looks distinctly playful — not a generic SaaS template.
