# Case-study frontend

Static browser UI (`case-study.html` + ES modules under `js/frontend/`) for browsing audit rows in Supabase and opening per-track detail, inspector JSON, and storage-backed artifacts.

## Stack

- **No build step:** the page loads modules directly (`import` from `./js/frontend/...`).
- **Supabase:** `@supabase/supabase-js` loaded from `esm.sh`.
- **Credentials:** `window.CASE_STUDY_CONFIG` in `case-study.html` supplies `supabaseUrl` and `supabaseAnonKey` (publishable/anon key only). Never embed the service role key in frontend assets.

Configuration defaults and merge logic: `js/frontend/case-study-config.js` (`getCaseStudyConfig()`).

## Data access layer

`js/frontend/case-study-data.js` exposes `createCaseStudyDataAccess(config)`:

| Method | Role |
|--------|------|
| `listAllTracks()` | Batched full-table read for client-side cache (see below). |
| `listTracks({ filters, page, pageSize, sort })` | Server-side filters, sort, pagination, `count: exact`. |
| `getTrackDetail(trackUid)` | Single track + joined metric rows (`DETAIL_SELECT`). |
| `downloadAuditJson` / `downloadRawGpxText` | Storage downloads using paths from the track row. |

List queries use a denormalizing `select()` with `ingestion_metrics!inner`, `temporal_metrics!inner`, etc. Rows are normalized via `normalizeTrackRow()` (nested objects + `inferDataSource()` when `data_source` is null in the DB).

## Client cache mode (default)

`CASE_STUDY_CONFIG.clientCacheMode` defaults to **`true`** in `case-study-config.js`.

**Behavior (`js/frontend/case-study-ui.js`, `refreshTrackList`):**

1. On first list load, if `cacheLoaded` is false, call `listAllTracks()`, which pages through the table with `.range(offset, offset + batchSize - 1)` until a short page is returned. Batch size = `fetchBatchSize` (default **1000**, minimum 100).
2. Store all normalized rows in `state.allRows` and set `state.cacheLoaded = true`.
3. For every subsequent list refresh (filters, sort, page): **no new list queries** — apply `applyLocalFilters(state.allRows, state.appliedFilters)`, then `sortRows`, then slice to the current page.
4. A **full browser reload** clears JS state; the cache is fetched again.

**Rationale:** One heavier initial load, then **instant** filter/sort/pagination and consistent totals without round-trips for every interaction.

**Tradeoffs:** Memory and first-load time grow with row count; very large corpora may need a higher `fetchBatchSize` tuning or disabling cache mode.

## Server-backed list mode

Set `clientCacheMode: false` in `CASE_STUDY_CONFIG`. The list uses `listTracks()` only: filters are applied in `applyFilters()` on the Supabase query (including `data_source` handling for legacy nulls). Sort uses `getOrderConfig()` (including related tables); a secondary `order("id", …)` keeps pagination stable when many rows share the same metric value.

## Filters and state

- **Draft vs applied:** `state.filters` holds the form; **`state.appliedFilters`** is what the table uses (updated on Apply, chip remove, reset). See `case-study-state.js` (`INITIAL_FILTERS`, `resetFilters`).

## Concurrency

`refreshTrackList` uses a **`listRequestNonce`** so overlapping async completions do not overwrite newer UI state.

## Detail and inspector

Selecting a row loads detail via `getTrackDetail`. The inspector fetches full audit JSON (and optionally GPX text) from Storage; this depends on bucket policies and object paths stored on the track row.

## Security note

The case study is designed for **anon + RLS read-only** access. The UI does not implement an additional auth layer.

## Related docs

- [`../supabase/import-audit-supabase.md`](../supabase/import-audit-supabase.md) — import scripts and `data_source` / backfill.
- [`../supabase/supabase-v2-upsert-mapping.md`](../supabase/supabase-v2-upsert-mapping.md) — column mapping from audit JSON.
