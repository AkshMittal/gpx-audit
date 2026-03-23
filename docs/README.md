# Documentation

This repository’s written material is organized as **stable reference** vs **time-bound reports**.

## Layout

| Path | What it is |
|------|------------|
| **[`project/`](project/README.md)** | Long-lived docs: GPX audit **pipeline** specs, **Supabase** mapping & import, **case-study** browser UI, product roadmap. |
| **[`reports/`](reports/README.md)** | Dated notes, full-run reconciliations, adversarial snapshots, **formal case-study report** (draft). |

## Where to start

| If you want to… | Read |
|-----------------|------|
| Understand the end-to-end audit pipeline and JSON contract | [`project/pipeline/post-1-pipeline-technical-writeup.md`](project/pipeline/post-1-pipeline-technical-writeup.md) |
| Look up v2 JSON paths | [`project/pipeline/json-schema-v2-glossary.md`](project/pipeline/json-schema-v2-glossary.md) |
| Map audit JSON → relational tables / Supabase | [`project/supabase/supabase-v2-upsert-mapping.md`](project/supabase/supabase-v2-upsert-mapping.md) |
| Run import scripts or fix `data_source` | [`project/supabase/import-audit-supabase.md`](project/supabase/import-audit-supabase.md) |
| How the case-study static UI queries Supabase | [`project/case-study/case-study-frontend.md`](project/case-study/case-study-frontend.md) |
| Formal case-study report (prevalence, methods, tables) | [`reports/case-study-formal-report.md`](reports/case-study-formal-report.md) |

## Repository root

- **[`LICENSE`](../LICENSE)** — ISC license (see also `package.json`).
- **[`SECURITY.md`](../SECURITY.md)** — credentials, Supabase client keys, and what not to commit.

## Branch note

[`BRANCH_POLICY.md`](../BRANCH_POLICY.md) describes what belongs on `main` vs `case-study`. This `docs/` tree is shared in spirit; some paths reference case-study-only assets (e.g. `case-study.html`, `fixtures/adversarial-custom-test/`).
