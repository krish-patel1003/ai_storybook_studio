# AI Storybook Studio

Turns a single prompt into a consistent, illustrated 10–15 page children's book with interactive reading and publish-ready PDF/EPUB export.

## Structure

```
apps/
  web/          # Next.js frontend (Vercel)
  api/          # FastAPI backend (Railway/Render)
workers/        # Celery async job workers
packages/
  shared-types/ # TypeScript types shared across apps
infra/
  docker/       # Dockerfiles
  terraform/    # Cloud infra as code
scripts/        # Dev utilities
.github/
  workflows/    # CI/CD per app
```

## Getting started

```bash
# Install dependencies
pnpm install

# Start full stack locally
docker-compose up

# Or run apps individually
pnpm dev --filter=web
pnpm dev --filter=api
```
