# Branch Policy

## Purpose

This repository uses two long-lived branches with explicit ownership.

## `main` (Foundation)

- Owns reusable pipeline code and validation assets.
- Keeps core modules, schema contracts, docs, and test fixtures.
- Must stay free from case-study-specific UI and execution tooling.

Allowed in `main`:
- `js/pipeline/*`
- `docs/project/` (pipeline, supabase, roadmap; see `docs/project/README.md`); `docs/reports/` for dated run notes
- custom test GPX fixtures and expected results

Not allowed in `main`:
- case-study frontend (`case-study.html`, `js/frontend/*`)
- case-study-only scripts (DB/storage import/upload/orchestration)
- generated run outputs, CSV datasets, parsed dumps

## `case-study` (Application)

- Includes the case-study product surface and execution stack.
- Contains UI, case-study scripts, and current pipeline code.
- May include custom test fixtures/results used for validation.

## Generated Data Policy (Both Branches)

Never commit generated/runtime artifacts, including:
- `runs/`
- `datasets/`
- logs and local env files

`.gitignore` must keep these excluded on both branches.
