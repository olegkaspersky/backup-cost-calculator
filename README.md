# Backup object-storage cost calculator

Static one-page calculator for backup storage costs across AWS S3, Google Cloud Storage,
Azure Blob, Gcore, and Cloudflare R2 — storage $/month, cost of a full
restore (retrieval + egress), and yearly total including restore drills. Region is
auto-suggested from the browser timezone (US / EU / AP), overridable.

## Deploy to GitHub Pages

1. Create a new GitHub repo and push the **contents of this folder** as the repo root.
2. Repo → Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. (Optional) Settings → Secrets → Actions → add `GCP_API_KEY` — an API key with the
   Cloud Billing Catalog API enabled — so GCS prices refresh too and more GCS regions
   can be added. Without it, GCS uses the pinned prices (verified 2026-07-08).

The `update-prices` workflow refreshes `prices.json` weekly (Monday 06:17 UTC) and on
manual dispatch, committing only when prices changed.

## Why prices aren't fetched live in the browser

- GCP's Billing Catalog API requires an API key — can't ship one in a public page.
- AWS's public bulk price-list endpoint doesn't send CORS headers — browsers can't call it.
- Gcore / R2 publish no pricing API at all.

So a scheduled CI job fetches server-side into `prices.json` and the page stays fully static.

## What's dynamic vs pinned

| Data                                                     | Source                                                                                    |
|----------------------------------------------------------|-------------------------------------------------------------------------------------------|
| AWS S3 storage $/GB/mo (6 regions)                       | AWS Price List Bulk API (keyless)                                                         |
| Azure Blob storage $/GB/mo (6 regions, GPv2 LRS)         | Azure Retail Prices API (keyless)                                                         |
| GCS storage $/GB/mo                                      | Billing Catalog API if `GCP_API_KEY` set, else pinned                                     |
| Retrieval fees, egress rates, min durations, Object Lock | Pinned in `scripts/fetch-prices.mjs` (change rarely; re-verify on provider announcements) |
| Gcore / R2                                               | Pinned (no APIs)                                                                          |

## Local run

```sh
node scripts/fetch-prices.mjs   # regenerates prices.json (Node 18+)
python -m http.server           # or any static server; open http://localhost:8000
```

`fetch-prices.mjs` fails loudly (non-zero exit) if any resulting price is outside sane
bounds, so a broken provider response can't silently corrupt `prices.json`.
