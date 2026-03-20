# Full Run Morning Report (Schema v2)

Date: 2026-03-20
Branch: `case-study`
Run IDs:
- Parse: `csv-v2-full-parse-min100-b500`
- Generate: `csv-v2-full-generate-min100-b500-v2`

## Outcome

End-to-end pipeline completed with 1:1 quantitative consistency across:
- Parsed GPX files
- Generated audit JSON files
- Supabase relational tables (`tracks` + 4 child metric tables)
- Supabase Storage objects (`raw-gpx`, `audit-details`)

## Final Counts

- Parsed GPX accepted (`>=100` points): **9550**
- Generated audit JSON: **9550**
- `tracks`: **9550**
- `ingestion_metrics`: **9550**
- `temporal_metrics`: **9550**
- `sampling_metrics`: **9550**
- `motion_metrics`: **9550**
- `tracks.raw_gpx_path IS NOT NULL`: **9550**
- `tracks.audit_detail_path` populated for v2 object paths: **9550**
- Storage `raw-gpx` objects: **9550**
- Storage `audit-details` objects: **9550**

## UID Set Reconciliation

All reconciliation checks returned zero mismatches:
- parsed vs generated
- parsed vs DB (`tracks.track_uid`)
- parsed vs DB `raw_gpx_path`-derived UID set
- parsed vs DB `audit_detail_path`-derived UID set

No missing UIDs and no extras in any compared set.

## Notes on Failures and Retries

- Parse phase encountered one malformed CSV GPX row on the final partial batch:
  - `rowNumber=12068`
  - `track_uid=5afb260b8f80884aaad9f60c`
  - error: `GPX parsing error: 15:20: unquoted attribute value.`
- Targeted retry reproduced the same parse error (deterministic bad source XML).
- This row was excluded from accepted parsed output; all accepted tracks were fully propagated downstream.

## Runtime/Execution Notes

- Single-pass parse and single-pass generate both hit Node heap OOM at this scale.
- Full run was completed reliably using 500-size batched execution with retries.
- To support batch-safe execution and stable naming, scripts were aligned to UID-based files:
  - parsed GPX: `<uid>.gpx`
  - audit JSON: `<uid>.audit.v2.json`
- Import/upload scripts were updated to support both legacy and v2 filename patterns.

