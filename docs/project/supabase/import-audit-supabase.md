# Audit JSON → Supabase import scripts

Shared implementation: `scripts/lib/audit-supabase-import-core.js`.

| Script | `tracks.data_source` | Use case |
|--------|----------------------|----------|
| `scripts/import-audit-hikr-12k.js` | `hikr_12k` | Bulk CSV / Hikr-style v2 audit JSON |
| `scripts/import-audit-adversarial-custom-test.js` | `custom-test` | Adversarial / lab GPX audits |

Both accept:

- `--file <path>` — single `.audit.json` or `.audit.v2.json`
- `--dir <path>` — all `*.audit.json` and `*.audit.v2.json` in the directory
- `--dry-run` — print mapped rows JSON, no DB writes
- `--limit N` / `--offset N` — slice the file list

Env (non–dry-run): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

**Renamed:** the former `import-audit-to-supabase.js` is replaced by `import-audit-hikr-12k.js` (same mapping + explicit `data_source`).

## Adversarial `custom-test` assets

- **GPX + JSON (tracked):** `fixtures/adversarial-custom-test/` — see `fixtures/adversarial-custom-test/README.md`.
- **DB import:** `node scripts/import-audit-adversarial-custom-test.js --dir fixtures/adversarial-custom-test/json` sets `tracks.data_source = custom-test`.
- **Storage (GPX + audit JSON):** `node scripts/upload-custom-test-fixtures-to-storage.js` (after import; updates `audit_detail_*` and `raw_gpx_*` on `tracks`).

## Legacy `data_source` NULL rows

Older imports may have left `tracks.data_source` **NULL**. The case-study UI infers cohort from `track_uid` (`custom-test-…` → `custom-test`, else `hikr_12k`) and applies matching server filters. To fix data at the source, run `scripts/sql/backfill-data-source.sql` in the Supabase SQL editor.
