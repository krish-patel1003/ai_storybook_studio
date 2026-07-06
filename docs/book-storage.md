# Book Storage Architecture

## Overview

Books use a two-layer storage system: **PostgreSQL** for all structured/textual data and **MinIO** (S3-compatible) for binary images.

---

## PostgreSQL — Structured Data

Three tables store everything relational and textual:

### `book`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner (indexed) |
| `title` | text | Book title |
| `raw_prompt` | text | Original user prompt |
| `age_range` | text | Target age range |
| `tone` | JSONB array | Tone tags |
| `art_style` | text | Illustration style |
| `safety_mode` | bool | Content safety flag |
| `page_count` | int | Number of pages |
| `model_provider` | text | LLM provider |
| `model_name` | text | LLM model name |
| `brief` | JSONB | Generated narrative (logline, moral, arc, etc.) |
| `visual_seed` | int | Seed for illustration consistency |
| `visibility` | enum | `public` or `private` |
| `stage` | enum | Pipeline state (see below) |
| `error` | text | Error message if stage = `failed` |

### `character`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `book_id` | UUID | FK → book (cascade delete) |
| `name` | text | Character name (unique per book) |
| `is_protagonist` | bool | |
| `role_description` | text | |
| `personality` | text | |
| `visual_anchors` | JSONB | Visual consistency descriptors |
| `illustration_prompt` | text | Prompt used for image generation |
| `reference_image_key` | text | MinIO object key for reference sheet |

### `page`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `book_id` | UUID | FK → book (cascade delete) |
| `order` | int | Page order (unique per book) |
| `is_cover` | bool | |
| `is_locked` | bool | Prevents regeneration |
| `narrative_role` | text | Story role of this page |
| `beat` | text | Story beat content |
| `emotional_note` | text | Emotional tone for this page |
| `characters_present` | JSONB array | Character names on this page |
| `setting_note` | text | Scene/setting description |
| `text` | text | Final generated page text |
| `word_count` | int | |
| `illustration_metadata` | JSONB | Generation params/prompts |
| `image_key` | text | MinIO object key for illustration |

---

## MinIO (S3) — Binary Images

All generated images are stored as objects in the `illustrations` bucket. Only the **key string** is saved in Postgres.

### Object key structure
```
illustrations/
  {book_id}/{page_id}.png              ← page illustrations
  characters/{book_id}/{char_id}.png   ← character reference sheets
```

### MinIO config (local dev)
- Endpoint: `minio:9000`
- Bucket: `illustrations`
- Credentials: `minioadmin` / `minioadmin`

---

## Data Relationships

```
User (1) ──→ (N) Book
              ├── brief (JSONB: title, logline, moral, arc…)
              ├── visual_seed
              ├── stage
              │
              ├── (N) Character
              │     ├── name, personality, visual_anchors
              │     └── reference_image_key → MinIO: characters/{book_id}/{char_id}.png
              │
              └── (N) Page (ordered)
                    ├── beat, text, illustration_metadata
                    └── image_key → MinIO: {book_id}/{page_id}.png
```

---

## Generation Pipeline Flow

```
1. User submits prompt
2. LLM generates: brief → characters → beats → page text
3. Results persisted to Postgres (Book.brief JSONB, Character rows, Page rows)
4. Image pipeline generates illustrations → uploaded to MinIO
5. MinIO keys saved back to page.image_key / character.reference_image_key
```

### Book stage enum
`pending → enhancing → characters → outline → pages → complete / failed`

---

## Key Files

| Purpose | Path |
|---------|------|
| Models (SQLAlchemy) | `apps/api/src/books/models.py` |
| Schemas (Pydantic) | `apps/api/src/books/schemas.py` |
| API routes | `apps/api/src/books/router.py` |
| Service / persistence | `apps/api/src/books/service.py` |
| MinIO client | `apps/api/src/storage/minio_client.py` |
| DB session | `apps/api/src/database.py` |
| Config / env | `apps/api/src/config.py` |
| Migrations | `apps/api/alembic/versions/` |

---

## Design Notes

- **JSONB** is used for `brief`, `tone`, `illustration_metadata`, `visual_anchors`, and `characters_present` to allow schema evolution without new migrations.
- **Images were originally stored as `bytea` blobs in Postgres** (migration 0005), then migrated to MinIO object keys (migration 0006) for scalability.
- **Cascade deletes** in the ORM remove characters and pages when a book is deleted, but **MinIO objects are not cleaned up** — orphaned image files will accumulate unless a cleanup job is added.
- **Owned resource pattern**: all API endpoints verify user ownership via an `owned_book()` dependency before any operation.
