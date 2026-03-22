# Project documentation

Long-lived reference for the GPX audit **pipeline**, **database/import** tooling, the **case-study** UI, and **roadmap**.

## [`pipeline/`](pipeline/)

Audit pipeline scope, per-module specs, and v2 JSON glossary.

| Doc | Topic |
|-----|--------|
| [`post-1-pipeline-technical-writeup.md`](pipeline/post-1-pipeline-technical-writeup.md) | End-to-end pipeline scope and module contract |
| [`gpx-ingestion-module.md`](pipeline/gpx-ingestion-module.md) | Ingestion |
| [`timestamp-audit.md`](pipeline/timestamp-audit.md) | Temporal audit |
| [`sampling-audit.md`](pipeline/sampling-audit.md) | Sampling audit |
| [`json-schema-v2-glossary.md`](pipeline/json-schema-v2-glossary.md) | v2 JSON paths glossary |

## [`supabase/`](supabase/)

Relational mapping and CLI import/upload.

| Doc | Topic |
|-----|--------|
| [`supabase-v2-upsert-mapping.md`](supabase/supabase-v2-upsert-mapping.md) | Audit JSON → relational tables |
| [`import-audit-supabase.md`](supabase/import-audit-supabase.md) | Import scripts, `data_source`, backfill SQL |

## [`case-study/`](case-study/)

| Doc | Topic |
|-----|--------|
| [`case-study-frontend.md`](case-study/case-study-frontend.md) | Static case-study UI, Supabase access, client cache |

## Root of `project/`

| Doc | Topic |
|-----|--------|
| [`product-roadmap.md`](product-roadmap.md) | Product roadmap |
