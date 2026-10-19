#!/usr/bin/env python3
"""
Load / scalability / reliability / resilience test for the Storybook API.

SAFETY: this intentionally exercises only cheap, read-only request paths —
health, public endpoints, auth (bcrypt), and authed DB reads. It never touches
the generation pipeline (Gemini costs money, writes data, runs for minutes), so
it is safe to run against production without spend or data pollution.

It measures how the request tier behaves under concurrency (revealing the Cloud
Run max-instances ceiling), under sustained load, and under a spike, plus input
validation. It POSTs a JSON report to /admin/test-results for the dashboard.

Usage:
  python scripts/loadtest.py \
      --base-url https://storybook-api-....run.app \
      --admin-user USER --admin-pass PASS \
      --login-email test@... --login-pass ...
Only stdlib is used.
"""
from __future__ import annotations

import argparse
import base64
import json
import socket
import ssl
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

_SSL_CTX = ssl.create_default_context()


def _request(base_url: str, method: str, path: str, *, headers=None, body=None, timeout=20.0) -> dict:
    """Perform one HTTP request. Returns {status, ms, ok, error}."""
    url = base_url.rstrip("/") + path
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
            resp.read()
            ms = (time.perf_counter() - start) * 1000.0
            return {"status": resp.status, "ms": ms, "error": None}
    except urllib.error.HTTPError as e:
        ms = (time.perf_counter() - start) * 1000.0
        return {"status": e.code, "ms": ms, "error": None}  # a real HTTP response
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as e:
        ms = (time.perf_counter() - start) * 1000.0
        return {"status": None, "ms": ms, "error": str(getattr(e, "reason", e))[:120]}
    except Exception as e:  # noqa: BLE001
        ms = (time.perf_counter() - start) * 1000.0
        return {"status": None, "ms": ms, "error": str(e)[:120]}


def _pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round((p / 100.0) * (len(s) - 1)))))
    return round(s[k], 1)


def _summarize(results: list[dict], wall_seconds: float, success_codes=range(200, 400)) -> dict:
    lat = [r["ms"] for r in results]
    ok = [r for r in results if r["status"] is not None and r["status"] in success_codes]
    conn_err = [r for r in results if r["status"] is None]
    status_counts: dict[str, int] = {}
    for r in results:
        key = str(r["status"]) if r["status"] is not None else "conn_error"
        status_counts[key] = status_counts.get(key, 0) + 1
    total = len(results)
    return {
        "requests": total,
        "success": len(ok),
        "success_rate": round(len(ok) / total, 4) if total else 0.0,
        "connection_errors": len(conn_err),
        "rps": round(total / wall_seconds, 1) if wall_seconds > 0 else 0.0,
        "latency_ms": {
            "p50": _pct(lat, 50), "p95": _pct(lat, 95), "p99": _pct(lat, 99),
            "max": round(max(lat), 1) if lat else 0.0,
            "mean": round(statistics.mean(lat), 1) if lat else 0.0,
        },
        "status_counts": status_counts,
    }


def _run_concurrent(fn, n: int, concurrency: int) -> tuple[list[dict], float]:
    """Fire n calls across `concurrency` workers; return (results, wall_seconds)."""
    results: list[dict] = []
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futs = [ex.submit(fn) for _ in range(n)]
        for f in as_completed(futs):
            results.append(f.result())
    return results, time.perf_counter() - start


def _run_sustained(fn, seconds: float, concurrency: int) -> tuple[list[dict], float]:
    results: list[dict] = []
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        inflight = set()
        while time.perf_counter() - start < seconds:
            while len(inflight) < concurrency:
                inflight.add(ex.submit(fn))
            done = {f for f in inflight if f.done()}
            for f in done:
                results.append(f.result())
            inflight -= done
            time.sleep(0.005)
        for f in as_completed(list(inflight)):
            results.append(f.result())
    return results, time.perf_counter() - start


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--admin-user", required=True)
    ap.add_argument("--admin-pass", required=True)
    ap.add_argument("--login-email", default=None)
    ap.add_argument("--login-pass", default=None)
    ap.add_argument("--no-post", action="store_true", help="don't POST results to /admin/test-results")
    args = ap.parse_args()

    base = args.base_url
    token = None
    if args.login_email and args.login_pass:
        r = _request(base, "POST", "/auth/login", body={"email": args.login_email, "password": args.login_pass})
        if r["status"] == 200:
            # fetch token body
            try:
                url = base.rstrip("/") + "/auth/login"
                req = urllib.request.Request(
                    url, data=json.dumps({"email": args.login_email, "password": args.login_pass}).encode(),
                    method="POST", headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=20, context=_SSL_CTX) as resp:
                    token = json.loads(resp.read())["access_token"]
            except Exception:
                token = None
    authed = {"Authorization": f"Bearer {token}"} if token else None

    report: dict = {
        "label": "API load / scalability / resilience test",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "target": base,
        "notes": "Read-only paths only; generation pipeline (Gemini) intentionally excluded. "
                 "Cloud Run was configured concurrency=4, max-instances=4 at test time.",
        "authed": bool(token),
        "scenarios": {},
    }

    def health(): return _request(base, "GET", "/health")
    def langs(): return _request(base, "GET", "/books/translate/languages")
    def sub(): return _request(base, "GET", "/billing/subscription", headers=authed)
    def login(): return _request(base, "POST", "/auth/login",
                                 body={"email": args.login_email, "password": args.login_pass})

    # ── 1. Cold-start / baseline single-request latency ──
    print("[1] baseline latency…")
    first = _request(base, "GET", "/health")
    warm = [_request(base, "GET", "/health")["ms"] for _ in range(5)]
    report["scenarios"]["baseline"] = {
        "description": "Single-request latency to /health (cold first hit, then warm).",
        "cold_first_ms": round(first["ms"], 1),
        "warm_mean_ms": round(statistics.mean(warm), 1),
    }

    # ── 2. Scalability ramp (concurrency curve) ──
    print("[2] scalability ramp…")
    ramp = {}
    target_fn, target_name = (sub, "GET /billing/subscription (authed DB read)") if authed else (health, "GET /health")
    for c in [1, 5, 10, 20, 40]:
        res, wall = _run_concurrent(target_fn, n=c * 8, concurrency=c)
        ramp[str(c)] = _summarize(res, wall)
        s = ramp[str(c)]
        print(f"    c={c:<3} rps={s['rps']:<7} p95={s['latency_ms']['p95']}ms "
              f"success={s['success_rate']*100:.1f}%")
    report["scenarios"]["scalability_ramp"] = {
        "description": f"Throughput & latency as concurrency rises against {target_name}.",
        "endpoint": target_name,
        "levels": ramp,
    }

    # ── 3. Sustained reliability ──
    print("[3] sustained reliability (20s @ c=20)…")
    res, wall = _run_sustained(health, seconds=20, concurrency=20)
    report["scenarios"]["reliability_sustained"] = {
        "description": "Sustained load on /health for 20s at concurrency 20.",
        **_summarize(res, wall),
    }

    # ── 4. Spike / resilience + recovery ──
    print("[4] spike + recovery…")
    res, wall = _run_concurrent(health, n=240, concurrency=80)
    spike = _summarize(res, wall)
    time.sleep(3)
    recov = [_request(base, "GET", "/health")["ms"] for _ in range(5)]
    report["scenarios"]["resilience_spike"] = {
        "description": "Sudden burst of 240 requests at concurrency 80, then recovery check.",
        "spike": spike,
        "recovery_mean_ms": round(statistics.mean(recov), 1),
        "recovered": statistics.mean(recov) < 500,
    }

    # ── 5. Input validation / graceful errors ──
    print("[5] input validation…")
    checks = [
        ("POST /auth/login malformed", _request(base, "POST", "/auth/login", body={"email": "x"})),
        ("POST /auth/login wrong creds", _request(base, "POST", "/auth/login",
                                                   body={"email": "nobody@example.com", "password": "nope"})),
        ("GET /books/<missing>", _request(base, "GET", "/books/00000000-0000-0000-0000-000000000000",
                                           headers=authed)),
        ("GET /billing/subscription no-auth", _request(base, "GET", "/billing/subscription")),
    ]
    validation = []
    for name, r in checks:
        code = r["status"]
        graceful = code is not None and 400 <= code < 500  # a clean client error, not a 5xx/crash
        validation.append({"check": name, "status": code, "graceful_4xx": graceful})
    report["scenarios"]["input_validation"] = {
        "description": "Malformed / unauthorized / missing requests should return clean 4xx, never 5xx.",
        "checks": validation,
        "all_graceful": all(v["graceful_4xx"] for v in validation),
    }

    # ── 6. Auth throughput (bcrypt-bound) ──
    if args.login_email and args.login_pass:
        print("[6] auth throughput…")
        res, wall = _run_concurrent(login, n=40, concurrency=8)
        report["scenarios"]["auth_throughput"] = {
            "description": "40 logins at concurrency 8 (bcrypt + DB read).",
            **_summarize(res, wall),
        }

    # ── Verdict ──
    ramp_levels = report["scenarios"]["scalability_ramp"]["levels"]
    worst_success = min(l["success_rate"] for l in ramp_levels.values())
    high_c = ramp_levels.get("40", ramp_levels[max(ramp_levels, key=lambda k: int(k))])
    sustained = report["scenarios"]["reliability_sustained"]
    spike_s = report["scenarios"]["resilience_spike"]["spike"]

    def verdict(ok, warn):
        return "pass" if ok else ("warn" if warn else "fail")

    report["verdict"] = {
        "scalability": {
            "rating": verdict(worst_success >= 0.99 and high_c["latency_ms"]["p95"] < 2000,
                              worst_success >= 0.95),
            "note": f"At c=40: p95={high_c['latency_ms']['p95']}ms, "
                    f"success={high_c['success_rate']*100:.1f}%, rps={high_c['rps']}. "
                    f"Latency climbs with concurrency because Cloud Run is capped at max-instances=4 "
                    f"(×concurrency 4 ≈ 16 in-flight). Raise max-instances to scale further.",
        },
        "reliability": {
            "rating": verdict(sustained["success_rate"] >= 0.999, sustained["success_rate"] >= 0.99),
            "note": f"Sustained 20s@c20: {sustained['success_rate']*100:.2f}% success, "
                    f"{sustained['connection_errors']} connection errors, p95={sustained['latency_ms']['p95']}ms.",
        },
        "resilience": {
            "rating": verdict(
                spike_s["success_rate"] >= 0.98 and report["scenarios"]["resilience_spike"]["recovered"]
                and report["scenarios"]["input_validation"]["all_graceful"],
                spike_s["success_rate"] >= 0.90),
            "note": f"Spike (c=80): {spike_s['success_rate']*100:.1f}% success; "
                    f"recovery {report['scenarios']['resilience_spike']['recovery_mean_ms']}ms; "
                    f"input-validation all-graceful={report['scenarios']['input_validation']['all_graceful']}.",
        },
    }
    report["finished_at"] = datetime.now(timezone.utc).isoformat()

    print("\n==== VERDICT ====")
    for dim, v in report["verdict"].items():
        print(f"  {dim:12s}: {v['rating'].upper():5s}  {v['note']}")

    # ── Store ──
    if not args.no_post:
        auth = "Basic " + base64.b64encode(f"{args.admin_user}:{args.admin_pass}".encode()).decode()
        r = _request(base, "POST", "/admin/test-results", headers={"Authorization": auth}, body=report)
        print(f"\nPOST /admin/test-results -> {r['status']}")

    print(json.dumps({"verdict": report["verdict"]}, indent=2))


if __name__ == "__main__":
    main()
