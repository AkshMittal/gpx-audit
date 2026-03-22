# gpx-audit

GPX **ingestion** and **audit** pipeline (temporal, sampling, motion) with a unified JSON export, optional **Supabase** relational mapping, and a static **case-study** explorer UI.

## Quick links

| | |
|--|--|
| **Documentation** | [`docs/README.md`](docs/README.md) |
| **Security & keys** | [`SECURITY.md`](SECURITY.md) |
| **License** | [ISC](LICENSE) (same as `package.json`) |
| **Branch layout** | [`BRANCH_POLICY.md`](BRANCH_POLICY.md) |

## Case-study UI (this branch)

Open `case-study.html` in a browser (local file or static host). Configure `window.CASE_STUDY_CONFIG` with your Supabase URL and anon key. See [`docs/project/case-study/case-study-frontend.md`](docs/project/case-study/case-study-frontend.md).

## Pipeline

The technical writeup and module specs live under [`docs/project/pipeline/`](docs/project/pipeline/README.md).
