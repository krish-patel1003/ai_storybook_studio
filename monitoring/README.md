# Storybook monitoring (Prometheus + Alertmanager + Grafana)

Open-source observability for the Storybook API. Run this stack on an internal
host (a small VM, a workstation, or an internal GKE/Compose host). It scrapes the
Cloud Run API's `/metrics` endpoint, evaluates alert rules, and visualizes in
Grafana. Nothing here needs to be exposed to the public internet.

```
monitoring/
├── docker-compose.yml
├── prometheus/prometheus.yml      # scrape config (API + self)
├── prometheus/alerts.yml          # alert rules
├── alertmanager/alertmanager.yml  # routing + Slack/email receivers
├── grafana/                       # datasource + dashboard provisioning
└── secrets/metrics_token          # (you create) bearer token for /metrics
```

## 1. Set the metrics token on the API

The API only serves `/metrics` to callers that present a bearer token matching
the `METRICS_TOKEN` env var. Pick a strong random value, store it in Secret
Manager, and point the Cloud Run service at it (do **not** paste the value into
source):

```bash
# generate a token and store it (run once, keep the value out of version control)
TOKEN=$(openssl rand -hex 32)
printf '%s' "$TOKEN" | gcloud secrets create storybook-metrics-token --data-file=- --project=ai-storybook-studio-496817
gcloud run services update storybook-api --region=us-central1 --project=ai-storybook-studio-496817 \
  --update-secrets=METRICS_TOKEN=storybook-metrics-token:latest

# give Prometheus the same token locally
printf '%s' "$TOKEN" > monitoring/secrets/metrics_token
chmod 600 monitoring/secrets/metrics_token
```

If `METRICS_TOKEN` is left unset on the service, `/metrics` is open (fine for a
local dev run, not for anything reachable).

## 2. Configure alert delivery

Edit `alertmanager/alertmanager.yml` and paste your Slack incoming-webhook URL
(Alertmanager does not expand env vars in its config). Or switch to the email
receiver example in that file.

## 3. Run

```bash
cp .env.example .env    # set GRAFANA_ADMIN_PASSWORD at minimum
docker compose up -d
```

- Grafana:        http://localhost:3001  (admin / $GRAFANA_ADMIN_PASSWORD) — "Storybook API" dashboard is pre-provisioned
- Prometheus:     http://localhost:9090  (Status → Targets should show `storybook-api` UP)
- Alertmanager:   http://localhost:9093

## What is monitored

HTTP metrics come from `prometheus-fastapi-instrumentator`; business metrics from
`src/metrics.py`:

| Metric | Meaning |
|---|---|
| `http_requests_total{status}` | request count by status (`status="2xx"`,`"5xx"`…) |
| `http_request_duration_seconds_bucket` | latency histogram (for p50/p95/p99) |
| `storybook_generation_total{result}` | generation started / success / failure |
| `storybook_generation_in_progress` | concurrent generations (throughput ceiling signal) |
| `storybook_pages_reserved_total` / `_refunded_total` | quota reserve-at-start / refunds |
| `storybook_avatars_generated_total` | AI avatars generated |
| `storybook_unhandled_errors_total{path}` | unhandled exceptions by route |

## Alerts (see `prometheus/alerts.yml`)

- **APIDown** (critical) — `/metrics` unscrapable for 2m.
- **HighServerErrorRate** (critical) — >5% 5xx over 5m.
- **UnhandledExceptions** (warning) — any unhandled exception in 10m.
- **HighLatencyP95** (warning) — p95 > 2s for 10m.
- **HighGenerationFailureRate** (critical) — >30% generations failing over 15m.
- **GenerationBacklog** (warning) — >8 concurrent generations for 10m (scale ceiling).

## Notes

- Error "tracking" here is metric + log based: unhandled exceptions increment a
  counter and are logged with stack traces to Cloud Logging
  (`logger.exception`), which is where you read the actual tracebacks. For
  full exception grouping with stack traces, a self-hosted **GlitchTip** (a
  Sentry-compatible OSS server) can be added later and the FastAPI app pointed
  at it with the `sentry-sdk`; the metrics/alerts above cover detection.
- Retention is 30 days (`--storage.tsdb.retention.time`). Adjust in
  `docker-compose.yml` as needed.
