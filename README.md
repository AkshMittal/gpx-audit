# gpx-audit

GPX audit toolkit for ingestion, temporal integrity checks, sampling diagnostics, and motion diagnostics, with schema-based JSON output and optional Supabase-backed exploration. Currently deployed at https://gpx-audit-case-study.vercel.app/

## What this branch contains (`case-study`)

- The DB-backed case study frontend: `case-study.html`
- Pipeline modules under `js/pipeline/`
- Documentation for pipeline, Supabase mapping/import, and reports
- Adversarial fixture corpus under `fixtures/adversarial-custom-test/`

## Start here

- Documentation hub: [`docs/README.md`](docs/README.md)
- Project docs index: [`docs/project/README.md`](docs/project/README.md)
- Pipeline technical writeup: [`docs/project/post-1-pipeline-technical-writeup.md`](docs/project/post-1-pipeline-technical-writeup.md)
- Case study frontend doc: [`docs/project/frontend/case-study-frontend.md`](docs/project/frontend/case-study-frontend.md)
- Formal report: [`docs/reports/case-study-formal-report.md`](docs/reports/case-study-formal-report.md)
- Branch policy: [`BRANCH_POLICY.md`](BRANCH_POLICY.md)

## Frontends

- Case study explorer (DB-backed): `case-study.html`
- Single-file GPX workbench (main-focused deploy): [`https://gpx-audit.vercel.app/`](https://gpx-audit.vercel.app/)
- Case study deployment: [`https://gpx-audit-case-study.vercel.app/`](https://gpx-audit-case-study.vercel.app/)

## Notes

- Keep secrets out of source control: [`SECURITY.md`](SECURITY.md)
- License: [`LICENSE`](LICENSE) (ISC)
