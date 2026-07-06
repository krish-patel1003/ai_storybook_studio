# AI Storybook Studio — Deployment Reference

**Stack:** GCP (API, DB, Cache, Storage, Registry, Secrets) + Vercel (Frontend)  
**Last updated:** 2026-06-11

---

## Architecture Overview

```
                         ┌─────────────────────────────┐
          Users ───────► │          Vercel             │
                         │   Next.js 15 · Edge CDN     │
                         └──────────────┬──────────────┘
                                        │ HTTPS
                         ┌──────────────▼──────────────┐
                         │       GCP Cloud Run         │
                         │     FastAPI · uvicorn       │
                         │     (generates all AI)      │
                         └──┬───────┬────────┬─────────┘
                            │       │        │
              ┌─────────────┘       │        └───────────────┐
              │                     │                        │
   ┌──────────▼──────┐  ┌──────────▼──────┐  ┌─────────────▼──────┐
   │   Cloud SQL     │  │  Memorystore    │  │  Cloud Storage     │
   │  PostgreSQL 16  │  │   Redis 7.x     │  │  (replaces MinIO)  │
   └─────────────────┘  └─────────────────┘  └────────────────────┘

                External AI APIs (called from Cloud Run)
   ┌────────────────────────────────────────────────────────────┐
   │  Google Gemini API                                         │
   │  ├─ gemini-2.5-flash     (text: outline/enhance/review)   │
   │  ├─ gemini-2.5-flash     (text: pages/characters/polish)  │
   │  ├─ gemini-2.5-flash-image  (illustration generation)     │
   │  └─ gemini-2.0-flash-tts-preview  (narration audio)       │
   └────────────────────────────────────────────────────────────┘
   ┌────────────────────────────────────────────────────────────┐
   │  ElevenLabs API  (voice cloning — when feature ships)      │
   └────────────────────────────────────────────────────────────┘

                Infrastructure services (GCP-internal)
   ┌──────────────────────┐  ┌─────────────────────────────────┐
   │  Artifact Registry   │  │       Secret Manager            │
   │  (Docker images)     │  │  (API keys, DB creds, etc.)     │
   └──────────────────────┘  └─────────────────────────────────┘
```

---

## Service Breakdown

### 1. Vercel — Frontend

| Field | Value |
|---|---|
| **What runs here** | Next.js 15 (React 19) App Router |
| **Tier** | Hobby (free) → Pro ($20/month) when team features needed |
| **Deploy trigger** | GitHub push to `main` → live in ~90s |
| **Preview URLs** | Automatic per PR |

**Key config:**
```
NEXT_PUBLIC_API_URL = https://api-<hash>-uc.a.run.app   # Cloud Run URL
```

**Why Vercel:** Next.js is Vercel's own framework. `next/font`, App Router SSR, Edge CDN, and preview deployments all work with zero configuration. No other platform gives you the same first-class Next.js support without significant ops work.

---

### 2. GCP Cloud Run — API

| Field | Value |
|---|---|
| **What runs here** | FastAPI + uvicorn, Docker container |
| **Image source** | Artifact Registry (see §7) |
| **Min instances** | 0 (scales to zero overnight) |
| **Max instances** | 10 (increase as traffic grows) |
| **CPU** | 2 vCPU |
| **Memory** | 2 GiB (image generation holds large numpy arrays) |
| **Request timeout** | 3600s (book generation takes 2–5 min) |
| **Concurrency** | 4 requests per instance (matches `PAGE_GEN_CONCURRENCY = 4`) |
| **Region** | `us-central1` (lowest Gemini API latency from GCP) |

**Why Cloud Run over alternatives:**
- GKE is massive over-engineering for a single containerised service at this stage
- Compute Engine requires manual patching, capacity planning, and scaling config
- App Engine is opinionated about runtime layout and slower to deploy

**Cloud SQL connection:** via Cloud SQL Auth Proxy (built into Cloud Run) — no public IP, no VPC needed.

**Estimated cost:** $8–25/month at 50–200 requests/day (2M request free tier per month).

---

### 3. GCP Cloud SQL — PostgreSQL 16

| Field | Value |
|---|---|
| **Engine** | PostgreSQL 16 |
| **Tier (start)** | `db-g1-small` — 1 vCPU, 1.7 GB RAM |
| **Tier (scale)** | `db-n1-standard-2` when >100 concurrent users |
| **Storage** | 20 GB SSD, auto-grow enabled |
| **Backups** | Automated daily, 7-day retention |
| **HA** | Single zone for now; enable HA failover before any public launch |
| **Connection** | Cloud SQL Auth Proxy from Cloud Run (private, no SSL cert management) |
| **Region** | `us-central1` (same as Cloud Run — zero cross-region latency) |

**Migration workflow — unchanged:**
```bash
# One-shot Cloud Run job on every deploy
gcloud run jobs execute migrate \
  --image=ARTIFACT_REGISTRY_IMAGE \
  --command="alembic upgrade head"
```

**Environment variable:**
```
DATABASE_URL = postgresql+asyncpg://storybook:<password>@/storybook?host=/cloudsql/<instance-connection-name>
```

**Estimated cost:** ~$15/month (`db-g1-small`).

---

### 4. GCP Memorystore — Redis 7.x

| Field | Value |
|---|---|
| **Version** | Redis 7.x |
| **Tier** | Basic (no HA replica) to start |
| **Memory** | 1 GB |
| **Region** | `us-central1` (same as Cloud Run) |
| **Connection** | Private IP via Serverless VPC Access connector |

**What Redis is used for in this app:**
- Session/token caching in `auth/service.py`
- Generation result caching in `books/service.py`

**VPC Connector requirement:** Memorystore is VPC-private. Cloud Run needs a Serverless VPC Access connector to reach it. This is a ~5-minute setup:
```bash
gcloud compute networks vpc-access connectors create storybook-connector \
  --region=us-central1 \
  --range=10.8.0.0/28
```
Then add `--vpc-connector=storybook-connector` to the Cloud Run deploy command.

**Environment variable:**
```
REDIS_URL = redis://10.x.x.x:6379   # private IP from Memorystore console
```

**Estimated cost:** ~$16–18/month (1 GB Basic tier, no replica).

---

### 5. GCP Cloud Storage — Object Storage

Replaces MinIO. Your MinIO Python client (`minio==7.2.15`) supports GCS via the XML (S3-compatible) API — one-line config change, no code rewrite.

| Field | Value |
|---|---|
| **Bucket** | `storybook-illustrations` (private) |
| **Location** | `us-central1` (same region as Cloud Run = free egress) |
| **Access** | Cloud Run service account IAM role: `roles/storage.objectAdmin` |
| **Public read** | Only for generated book pages served to readers |

**Config change in `config.py`:**
```python
MINIO_ENDPOINT: str  = "storage.googleapis.com"
MINIO_ACCESS_KEY: str  # GCS HMAC key (create in Console → Cloud Storage → Settings → Interoperability)
MINIO_SECRET_KEY: str  # GCS HMAC secret
MINIO_SECURE: bool = True
```

**Estimated cost:** ~$0.50–2/month (illustrations + audio + PDF/EPUB exports, $0.02/GB/month).

---

### 6. Gemini API — AI Generation

All AI calls originate from Cloud Run, billed directly to your Google Cloud project. The app uses **four distinct Gemini models**:

#### 6a. `gemini-2.5-flash` — Story Text Generation

Used for every text-generation stage in the pipeline:

| Stage | Temp | What it does |
|---|---|---|
| `EnhanceStage` | 0.85 | Expands raw user prompt into a full story brief |
| `CharacterStage` | 0.80 | Invents characters with traits, appearances, roles |
| `OutlineStage` | 0.75 | Builds the beat-by-beat story arc |
| `PageStage` | 0.90 | Writes prose for each page (up to 4 concurrent calls) |
| `PolishStage` | — | Simplifies and tightens page text |
| `ReviewStage` | 0.40 | Scores pages 1–5, rewrites any ≤ 3 |
| `RecalibrateStage` | 0.60 | Restructures weak beats before page generation |
| `KDP generation` | 0.65 | Generates Amazon listing copy, keywords, categories |

**Rough token usage per book (12 pages, age 6–8):**
- Input: ~8,000 tokens (system prompts + brief context per stage)
- Output: ~3,000 tokens (structured JSON responses)
- **Per book: ~11,000 tokens**

#### 6b. `gemini-2.5-flash-image` — Illustration Generation

| Field | Value |
|---|---|
| **Model** | `gemini-2.5-flash-image` (in `image.py`) |
| **Calls per book** | 1 per page + 2 cover images = 14 calls for a 12-page book |
| **Output** | PNG, composited into page layout by Pillow |
| **Concurrency** | Sequential per book (image model has its own rate limits) |

#### 6c. `gemini-2.0-flash-tts-preview` — Narration Audio

| Field | Value |
|---|---|
| **Model** | `gemini-2.0-flash-tts-preview` (in `tts.py`) |
| **Triggered by** | User clicking "Narrate" in the editor |
| **Output** | WAV bytes → stored in GCS, played back in reader |
| **Voices** | 8 prebuilt Gemini voices (Kore, Puck, Charon, etc.) |

#### Cost estimate for Gemini API

At current public pricing (Flash models):

| Usage | Tokens / Images | Monthly cost |
|---|---|---|
| 10 books/day text | ~110K tokens/day | ~$3–5 |
| 10 books/day images | ~140 image calls/day | ~$14–25 |
| 50 narrations/day | ~150K audio chars/day | ~$2–4 |
| **Total at 10 books/day** | | **~$20–35/month** |

Gemini API does **not** require a separate billing account — it uses your existing GCP project billing.

---

### 7. GCP Artifact Registry — Docker Images

| Field | Value |
|---|---|
| **Repository** | `us-central1-docker.pkg.dev/<project>/storybook/api` |
| **Format** | Docker |
| **Retention** | Keep last 5 tags, auto-delete older (set a cleanup policy) |
| **Auth** | GitHub Actions uses Workload Identity Federation (no long-lived keys) |

**Estimated cost:** ~$0.10/month (< 1 GB of image layers).

---

### 8. GCP Secret Manager — Secrets

Never put secrets in environment variable files, GitHub Actions secrets that get baked into images, or `.env` files committed to git. Every secret lives here.

| Secret name | Value |
|---|---|
| `gemini-api-key` | Your Gemini API key |
| `elevenlabs-api-key` | ElevenLabs API key (voice cloning) |
| `database-password` | Cloud SQL postgres user password |
| `jwt-secret` | JWT signing secret for auth tokens |
| `gcs-hmac-key` | GCS HMAC access key (for MinIO-compatible client) |
| `gcs-hmac-secret` | GCS HMAC secret |

Cloud Run reads these at startup:
```bash
gcloud run deploy api \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,\
ELEVENLABS_API_KEY=elevenlabs-api-key:latest,\
DATABASE_PASSWORD=database-password:latest
```

**Estimated cost:** < $0.10/month (6 secrets × $0.006/10K access operations).

---

### 9. ElevenLabs API — Voice Cloning (Planned)

| Field | Value |
|---|---|
| **Used for** | Cloning a parent/child's voice for personalised narration |
| **Called from** | Cloud Run (`generation/elevenlabs.py`) |
| **Minimum sample** | 30 seconds of audio |
| **TTS model** | `eleven_turbo_v2` (fastest, lowest cost) |
| **Billing** | Separate ElevenLabs account, not GCP-billed |

Not deployed until the Voice Studio feature ships. Add `ELEVENLABS_API_KEY` to Secret Manager when ready.

---

## Full Environment Variable Map

| Variable | Local (docker-compose) | Production (Cloud Run) |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://storybook:storybook@postgres:5432/storybook` | Cloud SQL proxy socket URL |
| `REDIS_URL` | `redis://redis:6379` | `redis://10.x.x.x:6379` (Memorystore private IP) |
| `MINIO_ENDPOINT` | `minio:9000` | `storage.googleapis.com` |
| `MINIO_ACCESS_KEY` | `minioadmin` | GCS HMAC key (from Secret Manager) |
| `MINIO_SECRET_KEY` | `minioadmin` | GCS HMAC secret (from Secret Manager) |
| `MINIO_SECURE` | `false` | `true` |
| `MINIO_BUCKET` | `illustrations` | `storybook-illustrations` |
| `GEMINI_API_KEY` | `.env` | Secret Manager |
| `ELEVENLABS_API_KEY` | `.env` | Secret Manager |
| `ENVIRONMENT` | `local` | `production` |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | `["https://yourapp.vercel.app"]` |

---

## Cost Summary

| Service | Tier | Monthly (low traffic) | Monthly (100 books/day) |
|---|---|---|---|
| Vercel | Hobby → Pro | $0 | $20 |
| Cloud Run (API) | Pay-per-request | $5 | $30–60 |
| Cloud SQL | db-g1-small | $15 | $30 (db-n1-standard-1) |
| Memorystore | 1 GB Basic | $16 | $32 (2 GB) |
| Cloud Storage | — | $1 | $5 |
| Gemini API (text) | Flash | $5 | $50 |
| Gemini API (images) | Flash Image | $15 | $150 |
| Gemini API (TTS) | Flash TTS | $3 | $25 |
| Artifact Registry | — | $0.10 | $0.10 |
| Secret Manager | — | $0.10 | $0.10 |
| **Total** | | **~$60/month** | **~$312/month** |

The dominant cost at scale is **image generation** — each illustration call to `gemini-2.5-flash-image` is the most expensive single operation in the pipeline.

---

## Deployment Checklist

### One-time GCP setup
- [ ] Create GCP project, enable billing
- [ ] Enable APIs: Cloud Run, Cloud SQL Admin, Memorystore, Cloud Storage, Artifact Registry, Secret Manager, Serverless VPC Access
- [ ] Create Cloud SQL instance (PostgreSQL 16, `db-g1-small`, `us-central1`)
- [ ] Create Memorystore instance (Redis 7, 1 GB Basic, `us-central1`)
- [ ] Create VPC Serverless Access connector (`us-central1`, range `10.8.0.0/28`)
- [ ] Create GCS bucket `storybook-illustrations` (`us-central1`, private)
- [ ] Create GCS HMAC keys (Console → Cloud Storage → Settings → Interoperability)
- [ ] Create Artifact Registry repository (`us-central1`, Docker)
- [ ] Create all secrets in Secret Manager
- [ ] Create Cloud Run service account with roles: `Cloud SQL Client`, `Storage Object Admin`, `Secret Manager Secret Accessor`

### CI/CD (GitHub Actions)
- [ ] Set up Workload Identity Federation (GCP ↔ GitHub, no long-lived keys)
- [ ] Add workflow: build → push to Artifact Registry → deploy to Cloud Run
- [ ] Add migration job: `alembic upgrade head` as Cloud Run Job on each deploy

### Vercel
- [ ] Import GitHub repo
- [ ] Set root directory to `apps/web`
- [ ] Set `NEXT_PUBLIC_API_URL` environment variable to Cloud Run URL
- [ ] Connect custom domain (optional)

### First deploy validation
- [ ] `GET /health` returns 200 from Cloud Run URL
- [ ] Alembic migrations applied (check Cloud SQL via `psql` or Cloud Console)
- [ ] Create a test book end-to-end from Vercel → Cloud Run → Gemini → GCS
- [ ] Download PDF export, verify font rendering
- [ ] Confirm narration audio plays in reader

---

## Future: Background Workers

The `workers/` directory and RabbitMQ in `docker-compose.yml` are placeholders — not implemented yet. When you need to offload book generation to background jobs (for longer timeouts or higher concurrency):

**Replace RabbitMQ with GCP Pub/Sub:**
- Cloud Run subscribes to a Pub/Sub topic (push subscription)
- Each generation job = one Pub/Sub message → one Cloud Run invocation
- No RabbitMQ server to operate, no CloudAMQP account needed
- Pub/Sub free tier: 10 GB/month

This keeps everything within GCP and requires only a lightweight refactor of the generation trigger in `service.py`.
