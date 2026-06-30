const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Auth types ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  author_name?: string | null;
  avatar_url?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: User;
}

// ── Book types ────────────────────────────────────────────────────────────────

export interface ArcStage {
  name: string;
  description: string;
  page_span: number;
}

export interface BriefOut {
  title: string;
  description: string;
  characters_intro: string[];
  themes: string[];
  lesson: string;
  arc: ArcStage[];
}

export interface CharacterOut {
  id: string;
  name: string;
  is_protagonist: boolean;
  role_description: string;
  personality: string;
  visual_anchors: string[];
  illustration_prompt: string;
  has_reference_image: boolean;
}

export interface IllustrationMetadata {
  mood: string;
  characters_present: string[];
  key_visual_elements: string[];
  composition_note: string;
  assembled_prompt: string;
  negative_prompt: string;
}

export type TextAlign    = "left" | "center" | "right";
export type TextPosition = "top"  | "center" | "bottom";

export interface CanvasOverlay {
  x: number;         // 0–1 fraction from left
  y: number;         // 0–1 fraction from top
  w: number;         // 0–1 fraction of page width
  h: number;         // 0–1 fraction of page height
  fontSize: number;  // px
  fontFamily: string;
  textColor: string;
  bgStyle: "none" | "frosted" | "darkened" | "stacked-bottom" | "stacked-top";
  bgOpacity: number;
}

export interface PageOut {
  id: string;
  order: number;
  is_cover: boolean;
  is_back_cover: boolean;
  is_locked: boolean;
  narrative_role: string;
  beat: string;
  emotional_note: string;
  characters_present: string[];
  setting_note: string;
  text: string | null;
  word_count: number | null;
  illustration_metadata: IllustrationMetadata | null;
  has_image: boolean;
  has_audio: boolean;
  text_align: TextAlign;
  text_position: TextPosition;
  canvas_overlay: CanvasOverlay | null;
  font_size: number | null;
  font_family: string | null;
  text_color: string | null;
  text_mode: number | null;
  bg_color: string | null;
}

export function pageImageUrl(bookId: string, pageId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}/books/${bookId}/pages/${pageId}/image`;
}

export function characterImageUrl(bookId: string, characterId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}/books/${bookId}/characters/${characterId}/image`;
}

export function publicPageImageUrl(bookId: string, pageId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}/books/public/${bookId}/pages/${pageId}/image`;
}

export type GenerationStage =
  | "pending"
  | "enhancing"
  | "characters"
  | "outline"
  | "pages"
  | "complete"
  | "failed";

export interface BookOut {
  id: string;
  title: string;
  raw_prompt: string;
  age_range: string;
  tone: string[];
  art_style: string;
  safety_mode: boolean;
  page_count: number;
  visibility: "public" | "private";
  stage: GenerationStage;
  error: string | null;
  brief: BriefOut | null;
  characters: CharacterOut[];
  pages: PageOut[];
  created_at: string;
  updated_at: string;
  child_profile_id: string | null;
  author_name: string | null;
}

// ── Child Profile types ───────────────────────────────────────────────────────

export interface ChildProfile {
  id: string;
  name: string;
  author_name?: string | null;
  age: number;
  gender: "boy" | "girl" | "nonbinary" | "unspecified";
  grade_level: string;
  interests: string[];
  reading_level: "beginner" | "early_reader" | "chapter_book";
  avatar_emoji: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProfileIn {
  name: string;
  author_name?: string | null;
  age: number;
  gender: "boy" | "girl" | "nonbinary" | "unspecified";
  grade_level: string;
  interests: string[];
  reading_level: "beginner" | "early_reader" | "chapter_book";
  avatar_emoji: string;
}

export interface BookSummaryOut {
  id: string;
  title: string;
  age_range: string;
  art_style: string;
  page_count: number;
  visibility: "public" | "private";
  stage: GenerationStage;
  illustrated_page_count: number;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
}

// ── Brainstorm + prompt expansion types ──────────────────────────────────────

export interface BrainstormIn {
  age_range: string;
  tone: string[];
  page_count: number;
  model_provider?: string;
  model_name?: string;
}

export interface StorySeedOut {
  title: string;
  hook: string;
}

export interface BrainstormOut {
  seeds: StorySeedOut[];
}

export interface ExpandPromptIn {
  raw_prompt: string;
  age_range: string;
  tone: string[];
  safety_mode: boolean;
  page_count: number;
  model_provider?: string;
  model_name?: string;
}

export interface ExpandedPromptOut {
  title: string;
  story_concept: string;
  key_characters: string[];
  story_highlights: string[];
  themes: string[];
  visual_style: string;
}

// ── Request types ─────────────────────────────────────────────────────────────

export interface BriefGenerateIn {
  raw_prompt: string;
  age_range: string;
  tone: string[];
  safety_mode: boolean;
  page_count: number;
  model_provider: string;
  model_name: string;
  expanded_concept?: ExpandedPromptOut;
}

export interface BriefFieldRegenerateIn extends BriefGenerateIn {
  current_brief: BriefOut;
  field: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  size: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
  models: ModelInfo[];
}

export interface ModelsOut {
  providers: ProviderInfo[];
}

export interface CreateBookIn {
  raw_prompt: string;
  age_range: string;
  tone: string[];
  art_style: string;
  safety_mode: boolean;
  page_count: number;
  model_provider: string;
  model_name: string;
  child_profile_id?: string | null;
  author_name?: string | null;
}

export interface UpdatePageIn {
  beat?: string;
  emotional_note?: string;
  setting_note?: string;
  is_locked?: boolean;
  text?: string;
  text_align?: TextAlign;
  text_position?: TextPosition;
  canvas_overlay?: CanvasOverlay | null;
  font_size?: number;
  font_family?: string;
  text_color?: string;
  text_mode?: number;
  bg_color?: string;
}

export interface BulkTextStyleIn {
  text_align?: TextAlign;
  text_position?: TextPosition;
  randomize?: boolean;
  align_pool?: TextAlign[];
  position_pool?: TextPosition[];
}

export interface AddPageIn {
  beat: string;
  narrative_role?: string;
  setting_note?: string;
  emotional_note?: string;
}

export interface AddCharacterIn {
  name: string;
  is_protagonist?: boolean;
  role_description?: string;
  personality?: string;
  visual_anchors?: string[];
  illustration_prompt?: string;
}

export interface CreateDraftIn {
  raw_prompt: string;
  age_range: string;
  tone: string[];
  safety_mode: boolean;
  page_count: number;
  model_provider: string;
  model_name: string;
  child_profile_id?: string | null;
  author_name?: string | null;
}

export interface VoiceProfile {
  id: string;
  name: string;
  created_at: string;
}

export interface KDPOut {
  title: string;
  subtitle: string;
  author: string;
  description_html: string;
  primary_category: string;
  secondary_category: string;
  keywords: string[];
  reading_age_min: number;
  reading_age_max: number;
  grade_range: string;
  language: string;
  trim_size: string;
  interior_type: string;
  paper_color: string;
  estimated_page_count: number;
  publishing_rights: string;
  territories: string;
  royalty_plan: string;
  suggested_price_usd: string;
  is_cached: boolean;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new ApiError("API not configured", 0);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail ?? "Something went wrong", res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

function authed(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

// ── API client ────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<AuthTokens>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    register: (username: string, email: string, password: string) =>
      request<{ message: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      }),

    updateMe: (token: string, data: { username?: string; author_name?: string }) =>
      request<User>("/auth/me", {
        method: "PATCH",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    verifyEmail: (token: string) =>
      request<AuthTokens>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),

    resendVerification: (email: string) =>
      request<{ message: string }>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    google: (token: string) =>
      request<AuthTokens>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),

    refresh: (refresh_token: string) =>
      request<AuthTokens>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token }),
      }),

    logout: (refresh_token: string) =>
      request<void>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token }),
      }),
  },

  books: {
    brainstorm: (token: string, data: BrainstormIn) =>
      request<BrainstormOut>("/books/prompts/brainstorm", {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    expandPrompt: (token: string, data: ExpandPromptIn) =>
      request<ExpandedPromptOut>("/books/prompts/expand", {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    generateBrief: (token: string, data: BriefGenerateIn) =>
      request<BriefOut>("/books/briefs/generate", {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    regenerateBriefField: (token: string, data: BriefFieldRegenerateIn) =>
      request<BriefOut>("/books/briefs/regenerate-field", {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    create: (token: string, data: CreateBookIn) =>
      request<BookOut>("/books", {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    models: (token: string) =>
      request<ModelsOut>("/books/models", { headers: authed(token) }),

    list: (token: string) =>
      request<BookSummaryOut[]>("/books", { headers: authed(token) }),

    get: (token: string, bookId: string) =>
      request<BookOut>(`/books/${bookId}`, { headers: authed(token) }),

    updatePage: (token: string, bookId: string, pageId: string, data: UpdatePageIn) =>
      request<BookOut>(`/books/${bookId}/pages/${pageId}`, {
        method: "PATCH",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    bulkPageStyle: (token: string, bookId: string, data: {
      font_family?: string; font_size?: number; text_color?: string;
      text_mode?: number; bg_color?: string; canvas_overlay?: object | null;
    }) =>
      request<BookOut>(`/books/${bookId}/pages/style`, {
        method: "PATCH",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    regeneratePage: (token: string, bookId: string, pageId: string) =>
      request<BookOut>(`/books/${bookId}/pages/${pageId}/regenerate`, {
        method: "POST",
        headers: authed(token),
      }),

    recalibrate: (token: string, bookId: string, newPageCount: number) =>
      request<BookOut>(`/books/${bookId}/recalibrate`, {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify({ new_page_count: newPageCount }),
      }),

    addPage: (token: string, bookId: string, data: AddPageIn) =>
      request<BookOut>(`/books/${bookId}/pages`, {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    illustrate: (token: string, bookId: string) =>
      request<BookOut>(`/books/${bookId}/illustrate`, {
        method: "POST",
        headers: authed(token),
      }),

    illustratePage: (token: string, bookId: string, pageId: string) =>
      request<BookOut>(`/books/${bookId}/pages/${pageId}/illustrate`, {
        method: "POST",
        headers: authed(token),
      }),

    generateCharacterSheets: (token: string, bookId: string) =>
      request<BookOut>(`/books/${bookId}/characters/sheets`, {
        method: "POST",
        headers: authed(token),
      }),

    addCharacter: (token: string, bookId: string, data: AddCharacterIn) =>
      request<BookOut>(`/books/${bookId}/characters`, {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    createDraft: (token: string, data: CreateDraftIn) =>
      request<BookOut>("/books/draft", {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    generate: (token: string, bookId: string, artStyle: string) =>
      request<BookOut>(`/books/${bookId}/generate`, {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify({ art_style: artStyle }),
      }),

    delete: (token: string, bookId: string) =>
      request<void>(`/books/${bookId}`, {
        method: "DELETE",
        headers: authed(token),
      }),

    updateVisibility: (token: string, bookId: string, visibility: "public" | "private") =>
      request<BookOut>(`/books/${bookId}`, {
        method: "PATCH",
        headers: authed(token),
        body: JSON.stringify({ visibility }),
      }),

    listExportFonts: (token: string) =>
      request<{ fonts: Array<{ id: string; label: string; is_default: boolean }> }>(
        `/books/export/fonts`,
        { headers: authed(token) },
      ),

    exportPdf: (token: string, bookId: string, fontId?: string): Promise<globalThis.Response> =>
      fetch(`${API_URL}/books/${bookId}/export/pdf${fontId ? `?font=${fontId}` : ""}`, { headers: authed(token) }),

    exportEpub: (token: string, bookId: string, fontId?: string): Promise<globalThis.Response> =>
      fetch(`${API_URL}/books/${bookId}/export/epub${fontId ? `?font=${fontId}` : ""}`, { headers: authed(token) }),

    exportCoverPdf: (token: string, bookId: string): Promise<globalThis.Response> =>
      fetch(`${API_URL}/books/${bookId}/export/cover-pdf`, { headers: authed(token) }),

    kdp: (token: string, bookId: string) =>
      request<KDPOut>(`/books/${bookId}/kdp`, { headers: authed(token) }),

    kdpRegenerate: (token: string, bookId: string) =>
      request<KDPOut>(`/books/${bookId}/kdp/regenerate`, {
        method: "POST",
        headers: authed(token),
      }),

    kdpUpdate: (token: string, bookId: string, data: Partial<Omit<KDPOut, "is_cached">>) =>
      request<KDPOut>(`/books/${bookId}/kdp`, {
        method: "PATCH",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    getPublicBook: (bookId: string) =>
      request<BookOut>(`/books/public/${bookId}`),

    listVoices: (token: string) =>
      request<{ voices: Array<{ id: string; description: string; is_default: boolean }> }>(
        `/books/voices`,
        { headers: authed(token) },
      ),

    narratePage: (
      token: string,
      bookId: string,
      pageId: string,
      voiceName?: string,
      voiceProfileId?: string,
    ) =>
      request<BookOut>(`/books/${bookId}/pages/${pageId}/narrate`, {
        method: "POST",
        headers: { ...authed(token), "Content-Type": "application/json" },
        body: JSON.stringify(
          voiceProfileId
            ? { voice_profile_id: voiceProfileId }
            : { voice_name: voiceName ?? "Kore" }
        ),
      }),

    narrateBook: (
      token: string,
      bookId: string,
      voiceName?: string,
      voiceProfileId?: string,
    ) =>
      request<BookOut>(`/books/${bookId}/narrate`, {
        method: "POST",
        headers: { ...authed(token), "Content-Type": "application/json" },
        body: JSON.stringify(
          voiceProfileId
            ? { voice_profile_id: voiceProfileId }
            : { voice_name: voiceName ?? "Kore" }
        ),
      }),

    pageAudioUrl: (bookId: string, pageId: string) =>
      `${API_URL}/books/${bookId}/pages/${pageId}/audio`,

    splitPage: (token: string, bookId: string, pageId: string) =>
      request<BookOut>(`/books/${bookId}/pages/${pageId}/split`, {
        method: "POST",
        headers: authed(token),
      }),

    createBackCover: (token: string, bookId: string) =>
      request<BookOut>(`/books/${bookId}/back-cover`, {
        method: "POST",
        headers: authed(token),
      }),

    illustrateBackCover: (token: string, bookId: string) =>
      request<BookOut>(`/books/${bookId}/back-cover/illustrate`, {
        method: "POST",
        headers: authed(token),
      }),
  },

  voices: {
    list: (token: string) =>
      request<VoiceProfile[]>("/voices", { headers: authed(token) }),

    upload: (token: string, formData: FormData): Promise<VoiceProfile> =>
      fetch(`${API_URL}/voices/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new ApiError(body.detail ?? "Upload failed", res.status);
        }
        return res.json();
      }),

    delete: (token: string, profileId: string) =>
      request<void>(`/voices/${profileId}`, {
        method: "DELETE",
        headers: authed(token),
      }),
  },

  profiles: {
    list: (token: string) =>
      request<ChildProfile[]>("/profiles", { headers: authed(token) }),

    create: (token: string, data: CreateProfileIn) =>
      request<ChildProfile>("/profiles", {
        method: "POST",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    update: (token: string, id: string, data: Partial<CreateProfileIn>) =>
      request<ChildProfile>(`/profiles/${id}`, {
        method: "PATCH",
        headers: authed(token),
        body: JSON.stringify(data),
      }),

    delete: (token: string, id: string) =>
      request<void>(`/profiles/${id}`, {
        method: "DELETE",
        headers: authed(token),
      }),
  },
};
