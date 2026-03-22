# Adversarial GPX (`custom-test` cohort)

GPX files are **copies** of `test-gpx-adversarial/adv-*.gpx` renamed so `track_uid` never collides with Hikr Mongo ids:

- **Pattern:** `custom-test-<original-stem>.gpx`  
  Example: `adv-01-exact-2pct-boundary.gpx` → `custom-test-adv-01-exact-2pct-boundary.gpx`
- **`track_uid`** = basename without `.gpx` (e.g. `custom-test-adv-01-exact-2pct-boundary`).

Files live under **`fixtures/adversarial-custom-test/`** (tracked in git) — not under `datasets/` (gitignored).

## Expected outcomes + run report (`EXPECTED.md`, `REPORT.md`)

Assertion targets and the latest harness run output for the 20 adversarial cases live **here** (same folder as the `custom-test` cohort). They are produced by:

```bash
node scripts/generate-gpx-adversarial-suite.js
```

That script writes **`adv-*.gpx`** under `test-gpx-adversarial/` and writes **`EXPECTED.md`** + **`REPORT.md`** in this directory.

## Regenerate audit JSON (v2)

From repo root:

```bash
npm run generate-adversarial-custom-test-audits
```

Or:

```bash
node scripts/run-csv-pilot.js --phase generate --run-name adversarial-custom-test --parsed-dir fixtures/adversarial-custom-test/gpx
```

Output: `runs/adversarial-custom-test/json/*.audit.v2.json` — sync into this repo copy:

```powershell
Copy-Item runs/adversarial-custom-test/json/*.audit.v2.json fixtures/adversarial-custom-test/json/
```

## Import to Supabase (`data_source = custom-test`)

```bash
node scripts/import-audit-adversarial-custom-test.js --dir fixtures/adversarial-custom-test/json
```

Dry-run first:

```bash
node scripts/import-audit-adversarial-custom-test.js --dry-run --limit 1 --dir fixtures/adversarial-custom-test/json
```

## Storage (GPX + JSON)

After DB import, upload both buckets and refresh `tracks` paths/hashes:

```bash
node scripts/upload-custom-test-fixtures-to-storage.js
```

(`--dry-run` supported.) Uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env`.
