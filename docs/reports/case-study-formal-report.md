---

title: "GPX Audit Case Study"

subtitle: "Prevalence and structure of temporal, sampling, and motion anomalies in hikr.org dataset sourced from Kaggle"  
version: "1.0"  
date: "23-03-2026"  
author: "Aksh Mittal"  
repository: "[https://github.com/AkshMittal/gpx-audit/tree/case-study](https://github.com/AkshMittal/gpx-audit/tree/case-study)"

---

# Executive summary

- **Cohort:** Primary analysis: **9,550** tracks drawn from the Kaggle dataset **GPX Hike Tracks** (Hikr-sourced GPX; see **§2.1** for URL and download date), after parse and **≥100 valid points** per track (schema v2). **20** adversarial `custom-test` tracks support pipeline validation (reported separately unless noted). Cohort **N** matches **Appendix B** (`cohort_track_count`).
- **Objective:** To **audit real-world GPX** at scale using a **fixed, pipeline-defined** rule set (ingestion, temporal order, sampling, motion)—so prevalence of irregularities is **explicit and reproducible**—and to **validate** that the audit pipeline behaves consistently when applied to a large field cohort (alongside lab fixtures), **without** claiming a statistically random or fully representative sample of all GPX.
- **Main findings:** **N = 9,550** (`data_source = 'hikr_12k'`). **~85.3%** of tracks have any timestamp strings in ingestion; **~19.4%** have any **missing** timestamp points (temporal); **~4.1%** **duplicate** timestamps; **~14.9%** **backtracking** (temporal) and the same order of magnitude for **backward-time** motion pairs; **~84.8%** have **positive** time-delta pairs (sampling). **Appendix B** records the full one-row cohort aggregate (**every `pct_*`, `max_*`, `p95_*`** output column and value).
- **Limitations:** A **single primary data source** acquired via Kaggle is **not** guaranteed to be random or representative of all hiking GPX. Metrics are **bounded by the current pipeline** (e.g. no dedicated elevation QA, no distance-based sampling audit, no richer backtracking semantics such as path regression, duplicate times inside backtracking blocks, or stitched-track discrimination). **Relational** columns are **summaries**; fine-grained **events** may exist only in **storage JSON**. Global `max_*` values can reflect **one extreme track**—read alongside `p95_*` (**§3**).

---

# 1. Introduction

## 1.1 Motivation

GPX files encode **what was recorded**—timestamps, point order, coordinates, and (when present) elevation—not a cleaned interpretation of *activity* or *intent*. Poor or irregular time order, missing times, and inconsistent sampling affect **any** downstream use that depends on distance, speed, duration, or elevation profiles, whether the goal is research, mapping, or product analytics.

This work treats GPX as an **observation and audit layer**: the pipeline **does not** smooth, correct, or rewrite tracks. It makes irregularities **explicit** as structured metrics and events so that “quality” is not assumed but **visible and reproducible**. Metrics are trustworthy when they are **operationally defined** from the file and the same rules applied to every track—see `[../project/pipeline/post-1-pipeline-technical-writeup.md](../project/pipeline/post-1-pipeline-technical-writeup.md)`.

## 1.2 Scope of this report

**In scope**

- **Structural / audit metrics** that are **present in the v2 JSON contract** or **deterministically derivable** from it and mapped to relational tables—e.g. counts, ratios, flags, session span, sampling and motion summaries as defined by the pipeline modules.
- **Prevalence and distribution** of those metrics within a defined cohort (primary: Hikr-sourced tracks in Supabase).
- **Separation** of **field-scale** cohort statistics from **lab** adversarial fixtures where appropriate.

**Out of scope**

- **Activity labeling** or semantic classification (e.g. “hiking vs cycling”) from GPX alone.
- **Correction**, **repair**, or **re-routing** of trajectories.
- **Routing** or map-matching.
- **Subjective “ground truth”** labels for anomalies where the pipeline does not define an objective rule (we report what the audit defines, not a single “definitive” interpretation of *meaning* outside that contract).

*Clarification:* The report **does** use **definitive, reproducible rules** for each metric (as in the schema). What is out of scope is **claims that go beyond** those definitions—e.g. naming activity types or asserting correctness without an external reference.

## 1.3 Relation to the audit pipeline (methodology)

**Primary methodology reference:** `[../project/pipeline/post-1-pipeline-technical-writeup.md](../project/pipeline/post-1-pipeline-technical-writeup.md)` — pipeline **scope**, **module boundaries**, **output contract**, and the rule that there is **no** smoothing, correction, or trajectory rewriting. That document is the authoritative description of *how* audits are defined; this report applies those definitions to a concrete cohort.

**End-to-end flow (summary):** **GPX → ingestion → temporal audit → sampling audit → motion audit → unified v2 JSON export**, then optional load into Supabase and storage of full JSON for deep inspection.

**Browse the cohort-facing case-study frontend:** **[https://gpx-audit-case-study.vercel.app/](https://gpx-audit-case-study.vercel.app/)** provides the read-only DB-backed explorer used to inspect tracks, filters, and deep JSON details for this study context.

**Try the pipeline on your own file (single-GPX workbench):** **[https://gpx-audit.vercel.app/](https://gpx-audit.vercel.app/)** hosts a browser UI to load one GPX file, run the client-side audit, and inspect JSON plus charts (e.g. KDE, scatter, map) without cloning the repo. It is the **interactive, single-track** counterpart to the batch CSV / Supabase workflow used for this cohort. The deployment tracks the repository `main` branch and **may update independently** of this report; **audit JSON shape and schema version may not match** schema **v2** (`.audit.v2.json`) frozen for this case study—use the linked pipeline docs and `case-study` tooling for an exact match to **Appendix B**.

**Supporting references (by concern):**


| Concern                                                | Document                                                                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline scope & contract                              | `[post-1-pipeline-technical-writeup.md](../project/pipeline/post-1-pipeline-technical-writeup.md)`                                                                                                  |
| v2 JSON paths (glossary)                               | `[json-schema-v2-glossary.md](../project/pipeline/json-schema-v2-glossary.md)`                                                                                                                      |
| Ingestion (coordinates, rejections, timestamp context) | `[gpx-ingestion-module.md](../project/pipeline/gpx-ingestion-module.md)` — detailed in **§3.1**                                                                                                     |
| Temporal / sampling / motion                           | `[timestamp-audit.md](../project/pipeline/timestamp-audit.md)`, `[sampling-audit.md](../project/pipeline/sampling-audit.md)`, `[motion-audit.js](../../js/pipeline/motion-audit.js)` — **§3.2–3.4** |
| Audit JSON → relational tables & storage               | `[supabase-v2-upsert-mapping.md](../project/supabase/supabase-v2-upsert-mapping.md)`                                                                                                                |


**Artifacts:** Per track, **schema v2** (`*.audit.v2.json`) is canonical. **Relational** tables (`tracks` + child metric tables) hold **queryable summaries**; **events, blocks, and full detail** may live only in **storage-backed JSON**—see the mapping doc. When this report states a number, it should say whether it comes from **relational columns** or from **JSON** (if applicable).

---

# 2. Data and cohort definition

## 2.1 Sources


| Source                               | Role                                          | Approx. count          | Notes                                                                                                                                                                                                                                                             |
| ------------------------------------ | --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hikr.org (Kaggle)**                | Primary cohort for prevalence / distributions | **9,550** tracks in DB | **12,141** candidate UIDs in the Kaggle CSV; **9,550** passed parse and **≥100 valid points per track** (batch runs `csv-v2-full-parse-min100-b500` / `csv-v2-full-generate-min100-b500-v2` on `case-study`). Primary SQL filter: `data_source = 'hikr_12k'`. |
| **custom-test** adversarial fixtures | Pipeline validation / stress testing          | **20** tracks          | Under `fixtures/adversarial-custom-test/`; `data_source = 'custom-test'`. **Not** mixed into Hikr prevalence unless explicitly labeled.                                                                                                                           |


*Provenance — primary dataset:* **GPX Hike Tracks** on Kaggle — [https://www.kaggle.com/datasets/roccoli/gpx-hike-tracks](https://www.kaggle.com/datasets/roccoli/gpx-hike-tracks). Dataset **downloaded 2026-02-26** (author’s machine; cite for reproducibility of the file snapshot used in the import pipeline). *Adversarial set:* `[fixtures/adversarial-custom-test/README.md](../../fixtures/adversarial-custom-test/README.md)` (repo root).

Schema version and ingestion methodology for aggregates appear in **§3** (Methods).

## 2.2 Reproducibility

- **Single-GPX workbench (no clone required):** **[https://gpx-audit.vercel.app/](https://gpx-audit.vercel.app/)** — same URL as **§1.3**. Deployed from `main`; may **drift** from schema **v2** / **Appendix B** over time. For **cohort-scale** reproduction, use **git + SQL** below, not the live site alone.
- **Case-study frontend (DB explorer):** **[https://gpx-audit-case-study.vercel.app/](https://gpx-audit-case-study.vercel.app/)** — interactive read-only surface for inspecting cohort-backed rows and storage JSON details aligned to the case-study workflow.
- **Cohort build:** Tracks in **§4** / **Appendix B** come from the `case-study` CSV parse → generate pipeline with **≥100** valid points per track, then import into Supabase with `data_source = 'hikr_12k'` (see `[../project/supabase/import-audit-supabase.md](../project/supabase/import-audit-supabase.md)`). This report does **not** embed a separate run log file.
- **Git:** Branch `case-study`. Baseline commit for SQL + pipeline aligned with v1.0: `20e28f8ff01774e9ce192255521ae102a12342c7` (short `20e28f8`). Use a **newer** commit on `case-study` only if **Appendix B** values are regenerated and the report is updated to match. Repository URL in YAML front matter.
- **Cohort numbers:** Run `[scripts/sql/case-study-hikr-cohort-aggregate.sql](../../scripts/sql/case-study-hikr-cohort-aggregate.sql)` in the Supabase SQL editor (join `tracks` + four metric tables, `WHERE data_source = 'hikr_12k'`). **Appendix B** is the **frozen output row** for this report.

---

# 3. Methods (operational definitions)

This section ties **cohort-level statistics** to **pipeline definitions**. The audit pipeline’s module-level methodology is documented in `[../project/pipeline/post-1-pipeline-technical-writeup.md](../project/pipeline/post-1-pipeline-technical-writeup.md)`; authoritative **relational ↔ JSON** names are in `[../project/supabase/supabase-v2-upsert-mapping.md](../project/supabase/supabase-v2-upsert-mapping.md)`.

**Cohort aggregates (§4, Appendix B):** Unless a column name states otherwise, `pct_`* columns are **100 × (tracks satisfying condition) / cohort_track_count**, where the condition is typically **numeric count or ratio > 0**, or **boolean = true**, or **IS NOT NULL** as noted. `max_`* and `p95_`* are **across-track** extrema / 95th percentiles of the per-track scalar (PostgreSQL `MAX`, `percentile_cont(0.95)`).

*Reading `max_` vs `p95_`*:** `max_`* is the **worst single track** in the cohort for that scalar (useful to show pathological cases exist). `p95_`* approximates the **upper tail among typical tracks**; prefer it when summarizing “how large do values get in practice?” The executable query is `[scripts/sql/case-study-hikr-cohort-aggregate.sql](../../scripts/sql/case-study-hikr-cohort-aggregate.sql)` (repo root).

## 3.1 Ingestion and schema version

- **Schema:** **v2** (`.audit.v2.json` contract). Glossary: `[../project/pipeline/json-schema-v2-glossary.md](../project/pipeline/json-schema-v2-glossary.md)`.
- **Ingestion (GPX → points):** coordinate validation, per-point rejection, valid point counts, GPX point-type counts, and timestamp context—full rules in `[../project/pipeline/gpx-ingestion-module.md](../project/pipeline/gpx-ingestion-module.md)`. This cohort used **≥100 valid points** at parse/generate time (same gate as **§2.1**).
- **Database `data_source`:** Set at import (`hikr_12k` vs `custom-test`) per `[../project/supabase/import-audit-supabase.md](../project/supabase/import-audit-supabase.md)`. Primary prevalence uses `data_source = 'hikr_12k'`.

**Table 3.1 — `ingestion_metrics` (relational ↔ JSON, cohort rules)**


| Reported concept              | Relational column          | v2 JSON path (`audit.ingestion…`) | Cohort aggregate rule (Appendix B)                    |
| ----------------------------- | -------------------------- | --------------------------------- | ----------------------------------------------------- |
| Total points                  | `total_point_count`        | `counts.totalPointCount`          | `p95_`* / `max_`* on column                           |
| Valid points                  | `valid_point_count`        | `counts.validPointCount`          | `p95_`* / `max_*`                                     |
| Rejected points               | `rejected_point_count`     | `counts.rejectedPointCount`       | `pct_im_rejected_point_count_gt0`: count > 0          |
| Waypoints (`wpt`)             | `point_type_wpt_count`     | `counts.pointTypeCounts.wpt`      | `pct_im_point_type_wpt_count_gt0`                     |
| Route points (`rtept`)        | `point_type_rtept_count`   | `counts.pointTypeCounts.rtept`    | `pct_im_point_type_rtept_count_gt0`                   |
| Track points (`trkpt`)        | `point_type_trkpt_count`   | `counts.pointTypeCounts.trkpt`    | `pct_im_point_type_trkpt_count_gt0`                   |
| Multiple point types          | `has_multiple_point_types` | `context.hasMultiplePointTypes`   | `pct_im_has_multiple_point_types_true`: value is true |
| Any timestamp strings in file | `has_any_timestamp_values` | `context.hasAnyTimestampValues`   | `pct_im_has_any_timestamp_values_true` / `_false`     |


*Module reference:* `[gpx-ingestion-module.md](../project/pipeline/gpx-ingestion-module.md)`. *Tracks summary:* `tracks.summary_total_point_count` ← `metadata.summary.totalPointCount` (§4 / `tr_`* aggregates).

## 3.2 Temporal (session and order)

**Table 3.2 — `temporal_metrics` (relational ↔ JSON, cohort rules)**


| Reported concept                             | Relational column(s)                                                                                                                         | v2 JSON path (`audit.temporal…`)                                                   | Cohort rule (Appendix B)                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Points evaluated                             | `total_points_evaluated`                                                                                                                     | `totalPointsEvaluated`                                                             | `p95_tm_`* / `max_tm_`*                                                         |
| Raw session duration (s)                     | `raw_session_duration_sec`                                                                                                                   | `session.rawSessionDurationSec`                                                    | `pct_tm_raw_session_duration_sec_not_null`: **IS NOT NULL**; also `p95` / `max` |
| Parseable timestamp point count              | `parseable_timestamp_point_count`                                                                                                            | `session.parseableTimestampPointCount`                                             | `p95` / `max`                                                                   |
| Monotonic forward count                      | `monotonic_forward_count`                                                                                                                    | `temporalOrder.monotonicForwardCount`                                              | `p95` / `max`                                                                   |
| Missing timestamp (count)                    | `missing_point_count`                                                                                                                        | `temporalOrder.missing.pointCount`                                                 | `pct_tm_missing_point_count_gt0`                                                |
| Missing (ratio)                              | `missing_point_count_over_total_points_ratio`                                                                                                | `temporalOrder.missing.pointCountOverTotalPointsRatio`                             | `pct_tm_missing_ratio_gt0`                                                      |
| Missing max block / isolated                 | `missing_max_block_length`, `missing_isolated_point_count`                                                                                   | `temporalOrder.missing.maxBlockLength`, `temporalOrder.missing.isolatedPointCount` | `p95` / `max` only                                                              |
| Unparsable (count / ratio / blocks)          | `unparsable_point_count`, `unparsable_point_count_over_total_points_ratio`, `unparsable_max_block_length`, `unparsable_isolated_point_count` | `temporalOrder.unparsable.`*                                                       | `pct_tm_unparsable_*_gt0` for count & ratio; `p95` / `max` for all              |
| Duplicate timestamp (count / ratio / blocks) | `duplicate_point_count`, `duplicate_point_count_over_total_points_ratio`, `duplicate_max_block_length`, `duplicate_isolated_point_count`     | `temporalOrder.duplicate.`*                                                        | `pct_tm_duplicate_*_gt0` for count & ratio; `p95` / `max` for all               |
| Backtracking (count / depth / blocks)        | `backtracking_point_count`, `backtracking_max_depth_from_anchor_ms`, `backtracking_max_block_length`, `backtracking_isolated_point_count`    | `temporalOrder.backtracking.`*                                                     | `pct_tm_backtracking_point_count_gt0`; `p95` / `max` for all                    |


*Semantics:* `raw_session_duration_sec` may be **null** when session endpoints are not computable; **0** is valid when first/last parseable times coincide (see mapping doc). *Module reference:* `[timestamp-audit.md](../project/pipeline/timestamp-audit.md)`.

## 3.3 Sampling (time deltas, clustering, normalization, distance)

**Table 3.3 — `sampling_metrics` (relational ↔ JSON, cohort rules)**


| Reported concept                          | Relational column                                                                                                                                | v2 JSON path (`audit.sampling…`)                                                  | Cohort rule (Appendix B)                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Any parseable timestamp                   | `has_any_parseable_timestamp`                                                                                                                    | `time.timestampContext.hasAnyParseableTimestamp`                                  | `pct_sm_has_any_parseable_timestamp_true`: true                                                    |
| Any positive Δt                           | `has_any_positive_time_delta`                                                                                                                    | `time.timestampContext.hasAnyPositiveTimeDelta`                                   | `pct_sm_has_any_positive_time_delta_true`                                                          |
| Timestamped points / consecutive pairs    | `timestamped_points_count`, `consecutive_timestamp_pairs_count`                                                                                  | `time.timestampContext.`* (e.g. counts under `timestampContext`)                  | `p95` / `max`                                                                                      |
| Positive time-delta count                 | `positive_time_delta_count`                                                                                                                      | `time.timestampContext.positiveTimeDeltaCount`                                    | `p95` / `max`                                                                                      |
| Non-positive Δt pairs                     | `non_positive_time_delta_pair_count`                                                                                                             | `time.timestampContext.rejections.nonPositiveTimeDeltaPairs.nonPositivePairCount` | `pct_sm_non_positive_time_delta_pair_count_gt0`                                                    |
| Positive delta count (stats)              | `positive_delta_count`                                                                                                                           | `time.deltaStatistics.positiveDeltaCount`                                         | `p95` / `max`                                                                                      |
| Δt min / max / median (ms)                | `delta_min_ms`, `delta_max_ms`, `delta_median_ms`                                                                                                | `time.deltaStatistics.minMs`, `maxMs`, `medianMs`                                 | `p95` / `max`                                                                                      |
| Insertion threshold                       | `insertion_relative_threshold`                                                                                                                   | `time.clustering.insertionRelativeThreshold`                                      | `p95` / `max`                                                                                      |
| Sorted / sequential cluster counts        | `sorted_cluster_count`, `sequential_cluster_count`                                                                                               | `time.clustering.sortedClusterCount`, `sequentialClusterCount`                    | `p95` / `max`                                                                                      |
| Cluster ratios                            | `sorted_cluster_count_over_total_deltas_ratio`, `sequential_cluster_count_over_total_deltas_ratio`, `sequential_over_sorted_cluster_count_ratio` | `time.clustering.*Ratio`                                                          | `pct_sm_sorted_cluster_ratio_gt0`, `pct_sm_sequential_cluster_ratio_gt0`; `p95` / `max` for ratios |
| Normalization deviations                  | `mean_final_absolute_deviation_sec`, `max_final_absolute_deviation_sec`, `mean_final_relative_deviation`, `max_final_relative_deviation`         | `time.normalization.`*                                                            | `p95` / `max` (all `normalization` fields may be **null** if not computable)                       |
| Non-zero / zero final deviation counts    | `non_zero_final_deviation_count`, `zero_final_deviation_count`                                                                                   | `time.normalization.`*                                                            | `p95` / `max`                                                                                      |
| Distance: consecutive pairs               | `distance_consecutive_pair_count`                                                                                                                | `distance.pairInspection.consecutivePairCount`                                    | `p95` / `max`                                                                                      |
| Invalid distance rejections               | `invalid_distance_rejection_count`                                                                                                               | `distance.pairInspection.rejections.invalidDistance.count`                        | `pct_sm_invalid_distance_rejection_count_gt0`                                                      |
| Geometry-conditioned / time-conditioned Δ | `geometry_conditioned_delta_count`, `time_conditioned_delta_count`                                                                               | `distance.geometryConditioned.deltaCount`, `distance.timeConditioned.deltaCount`  | `p95` / `max`                                                                                      |


*Module reference:* `[sampling-audit.md](../project/pipeline/sampling-audit.md)`.

## 3.4 Motion (pairs, rejections, time, distance, speed)

**Table 3.4 — `motion_metrics` (relational ↔ JSON, cohort rules)**


| Reported concept                | Relational column                                     | v2 JSON path (`audit.motion…`)                           | Cohort rule (Appendix B)                                         |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Consecutive pairs evaluated     | `consecutive_pair_count`                              | `evaluatedPairs.consecutivePairCount`                    | `p95` / `max`                                                    |
| Forward-valid pairs             | `forward_valid_pair_count`                            | `evaluatedPairs.forwardValidPairCount`                   | `p95` / `max`                                                    |
| Missing timestamp on pair       | `missing_timestamp_pair_count`                        | `rejections.missingTimestampPairCount`                   | `pct_mo_missing_timestamp_pair_count_gt0`                        |
| Unparsable timestamp on pair    | `unparsable_timestamp_pair_count`                     | `rejections.unparsableTimestampPairCount`                | `pct_mo_unparsable_timestamp_pair_count_gt0`                     |
| Non-finite distance             | `non_finite_distance_pair_count`                      | `rejections.nonFiniteDistancePairCount`                  | `pct_mo_non_finite_distance_pair_count_gt0`                      |
| Backward time                   | `backward_time_pair_count`                            | `rejections.backwardTimePairCount`                       | `pct_mo_backward_time_pair_count_gt0`                            |
| Zero time delta                 | `zero_time_delta_pair_count`                          | `rejections.zeroTimeDeltaPairCount`                      | `pct_mo_zero_time_delta_pair_count_gt0`                          |
| Valid / invalid motion time (s) | `valid_motion_time_seconds`, `invalid_time_seconds`   | `time.validMotionTimeSeconds`, `time.invalidTimeSeconds` | `p95` / `max`                                                    |
| Invalid time share              | `invalid_time_share_of_evaluated_time`                | `time.invalidTimeShareOfEvaluatedTime`                   | `pct_mo_invalid_time_share_gt0`; `p95` / `max`                   |
| Forward-valid distance (m)      | `total_forward_valid_distance_meters`                 | `distance.totalForwardValidDistanceMeters`               | `p95` / `max`                                                    |
| Mean / median / max speed (m/s) | `mean_speed_mps`, `median_speed_mps`, `max_speed_mps` | `speed.meanSpeedMps`, `medianSpeedMps`, `maxSpeedMps`    | `pct_mo_*_not_null`: **IS NOT NULL**; `p95` / `max` when present |


*Motion implementation:* `js/pipeline/motion-audit.js`. *Mapping:* `[supabase-v2-upsert-mapping.md](../project/supabase/supabase-v2-upsert-mapping.md)`. Pair-level rejection **events** are not stored relationally; use storage JSON for drill-down.

## 3.5 Cohort filters for aggregate tables

- **Primary prevalence:** `data_source = 'hikr_12k'` (9,550 tracks).
- **Adversarial:** `data_source = 'custom-test'` — report **separately** or in labeled comparison tables; do **not** merge into Hikr denominators unless explicitly justified.

---

# 4. Results

Aggregates below are from **one PostgreSQL** `SELECT` — see `[scripts/sql/case-study-hikr-cohort-aggregate.sql](../../scripts/sql/case-study-hikr-cohort-aggregate.sql)` — over `tracks` **INNER JOIN**ed to `ingestion_metrics`, `temporal_metrics`, `sampling_metrics`, and `motion_metrics`, with `WHERE data_source = 'hikr_12k'`. Semantics of `pct_`*, `max_`*, and `p95_*` are defined in **§3** (Methods). **Field definitions** match **§3.1–3.4** and `[supabase-v2-upsert-mapping.md](../project/supabase/supabase-v2-upsert-mapping.md)`. **Appendix B** lists **every output column** and value for this run.

## 4.1 Cohort overview

**Table 1.** Hikr primary cohort — one-row SQL summary.


| Quantity                                 | Value                               | SQL column(s)                                          |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| Tracks in cohort                         | **9,550**                           | `cohort_track_count`                                   |
| p95 total / valid points (ingestion)     | **~530**                            | `p95_im_total_point_count`, `p95_im_valid_point_count` |
| Global max total / valid points          | **13,575**                          | `max_im_total_point_count`, `max_im_valid_point_count` |
| p95 `tracks.summary_total_point_count`   | **~530**                            | `p95_tr_summary_total_point_count`                     |
| Ingestion: any `wpt` / `rtept` / `trkpt` | **15.24%** / **5.18%** / **94.89%** | `pct_im_point_type_*_count_gt0`                        |
| Multiple GPX point types in one file     | **15.26%**                          | `pct_im_has_multiple_point_types_true`                 |
| Any rejected points                      | **0%**                              | `pct_im_rejected_point_count_gt0`                      |


## 4.2 Temporal anomalies

**Table 2.** Cohort prevalence (temporal module). See Appendix B for all `tm_`* columns.


| Pattern                          | % cohort (any)                     | Notes                                                              |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Missing timestamp points         | **19.41%**                         | `pct_tm_missing_point_count_gt0`                                   |
| Unparsable timestamp points      | **0.01%**                          | `pct_tm_unparsable_point_count_gt0`                                |
| Duplicate timestamps             | **4.15%**                          | `pct_tm_duplicate_point_count_gt0`                                 |
| Backtracking (time order)        | **14.90%**                         | `pct_tm_backtracking_point_count_gt0`                              |
| No raw session duration (null)   | **14.69%**                         | `100 − pct_tm_raw_session_duration_sec_not_null` (85.31% not null) |
| Any timestamp values (ingestion) | **85.31%** true / **14.69%** false | `pct_im_has_any_timestamp_values_true` / `_false`                  |


## 4.3 Sampling metrics

**Table 3.** Sampling / ordering summaries (`sm_`*). Highlights:


| Metric                                      | % cohort   | SQL column                                      |
| ------------------------------------------- | ---------- | ----------------------------------------------- |
| Any parseable timestamp                     | **85.31%** | `pct_sm_has_any_parseable_timestamp_true`       |
| Any positive time delta (consecutive pairs) | **84.82%** | `pct_sm_has_any_positive_time_delta_true`       |
| Non-positive time-delta pairs > 0           | **17.87%** | `pct_sm_non_positive_time_delta_pair_count_gt0` |
| Sorted-cluster ratio > 0                    | **84.82%** | `pct_sm_sorted_cluster_ratio_gt0`               |
| Sequential-cluster ratio > 0                | **84.82%** | `pct_sm_sequential_cluster_ratio_gt0`           |
| Invalid distance rejections > 0             | **0%**     | `pct_sm_invalid_distance_rejection_count_gt0`   |


## 4.4 Motion metrics

**Table 4.** Motion pairs and speed summaries (`mo_`*). Highlights:


| Metric                                                           | % cohort        | SQL column                                                                                |
| ---------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| Backward-time pairs > 0                                          | **14.90%**      | `pct_mo_backward_time_pair_count_gt0`                                                     |
| Zero time-delta pairs > 0                                        | **4.15%**       | `pct_mo_zero_time_delta_pair_count_gt0`                                                   |
| Missing timestamp on pair > 0                                    | **3.19%**       | `pct_mo_missing_timestamp_pair_count_gt0`                                                 |
| Invalid time share > 0                                           | **14.90%**      | `pct_mo_invalid_time_share_gt0`                                                           |
| Unparsable timestamp pairs / non-finite distance pairs > 0       | **0%**          | `pct_mo_unparsable_timestamp_pair_count_gt0`, `pct_mo_non_finite_distance_pair_count_gt0` |
| `mean_speed_mps` / `median_speed_mps` / `max_speed_mps` not null | **84.82%** each | `pct_mo_*_not_null`                                                                       |


## 4.5 Co-occurrence

Joint prevalence (e.g. tracks with **both** temporal flag A **and** motion flag B) is **not** computed here; **§4.2–4.4** give univariate `pct_`* only. Any future pairwise table should use a **small, pre-specified** set of combinations and note correlation / multiple-comparison limits (**§5.3**).

---

# 5. Discussion

## 5.1 Interpretation

In **9,550** Hikr-sourced tracks (≥100 valid points), irregular time structure is **frequent**: **§4** shows non-trivial prevalence of **missing** timestamps, **duplicates**, **backtracking**, and **backward-time** motion pairs. Yet **~85%** of tracks still expose **some** timestamp strings and **parseable** sampling context—so time-based analysis is often **feasible** if implementations tolerate **imperfect** monotonicity and sampling.

## 5.2 Comparison to adversarial harness

The **custom-test** set (**20** tracks) stress-tests **pipeline behavior**; it is **not** in the **9,550** denominators. Fixtures validate that flagged issues match **JSON/event** intent; **§4** shows how often analogous patterns appear **in the field**.

## 5.3 Limitations (expanded)

- **Single source / selection:** One Kaggle corpus is **not** a random sample of all GPX or all hiking activity; the **≥100 valid points** gate removes short tracks and shapes prevalence.
- **Pipeline scope:** Metrics **do not** cover everything one might want—e.g. **elevation** sanity checks, **distance-based sampling** characterization, richer **backtracking** interpretation (geometry along the path, duplicate timestamps inside backtracking blocks, stitched segments), or semantic **activity** labels.
- **Representation:** Relational tables store **summaries**; **blocks/events** may live in **storage JSON** only—deep case studies may require pulling full audit JSON.
- **No external ground truth:** The audit states **what the file contains under fixed rules**, not whether a track is “correct” against an independent reference.
- **Statistical caution:** Many metrics are **correlated** (e.g. missing times and null session duration); exploratory **co-occurrence** scans (§4.5) would need **multiple-testing** awareness if formal inference were attempted—which this report does **not** do.

---

# 6. Conclusion

This report applied a **fixed, documented** GPX audit pipeline to **9,550** Hikr-sourced tracks (Kaggle corpus, **≥100** valid points, schema **v2**) and summarized cohort-wide prevalence in **one reproducible SQL aggregate** (**Appendix B**). **Missing** and **irregular** timestamps, **backtracking**, and related **motion** effects appear at **substantial** rates, while a **large majority** of tracks still carry **usable** time context for analysis. The audit is **observational**—it surfaces what files contain under explicit rules; it does **not** repair tracks or claim **global** representativeness. **§2.2** gives **git** and **SQL** to reproduce **Appendix B**; **[https://gpx-audit.vercel.app/](https://gpx-audit.vercel.app/)** supports exploratory single-file runs, and **[https://gpx-audit-case-study.vercel.app/](https://gpx-audit-case-study.vercel.app/)** provides the DB-backed case-study explorer. The single-file workbench may **diverge** from **v2** as `main` evolves (**§1.3**).

**Next steps (after v1.0):**

- Re-run the cohort aggregate after material DB/pipeline changes and refresh **Appendix B** + git pin in **§2.2**.
- Optionally add a **small** co-occurrence table (**§4.5**) with **pre-specified** pairs.
- Extend pipeline docs if new modules (e.g. elevation QA) change the contract.

---

# References

- **GPX Audit — single-file interactive workbench** (browser). [https://gpx-audit.vercel.app/](https://gpx-audit.vercel.app/) — deployed from `main`; JSON/schema may **not** match **v2** / **Appendix B** (see §1.3, §2.2, §6).
- **GPX Audit Case Study Explorer** (DB-backed frontend). [https://gpx-audit-case-study.vercel.app/](https://gpx-audit-case-study.vercel.app/) — read-only cohort explorer for track filtering, detail cards, and deep inspector views used in case-study analysis.
- roccoli. *GPX Hike Tracks* [dataset]. Kaggle. [https://www.kaggle.com/datasets/roccoli/gpx-hike-tracks](https://www.kaggle.com/datasets/roccoli/gpx-hike-tracks) (accessed / downloaded 2026-02-26 per §2.1).
- `[../project/pipeline/post-1-pipeline-technical-writeup.md](../project/pipeline/post-1-pipeline-technical-writeup.md)` — pipeline scope and contract.
- `[../project/pipeline/json-schema-v2-glossary.md](../project/pipeline/json-schema-v2-glossary.md)` — v2 JSON paths.
- `[../project/supabase/import-audit-supabase.md](../project/supabase/import-audit-supabase.md)` — import / `data_source` conventions.
- `[../project/supabase/supabase-v2-upsert-mapping.md](../project/supabase/supabase-v2-upsert-mapping.md)` — relational schema ↔ audit JSON.
- `[../../scripts/sql/case-study-hikr-cohort-aggregate.sql](../../scripts/sql/case-study-hikr-cohort-aggregate.sql)` — Hikr cohort one-row aggregate query (same column names as **Appendix B**).

---

# Appendix A — Cohort aggregate SQL

The query that produces the **§4 / Appendix B** column names and values for `data_source = 'hikr_12k'` is committed as:

`[scripts/sql/case-study-hikr-cohort-aggregate.sql](../../scripts/sql/case-study-hikr-cohort-aggregate.sql)` (from repo root).

Run it in the **Supabase SQL editor** against a database where every Hikr track has joined rows in `ingestion_metrics`, `temporal_metrics`, `sampling_metrics`, and `motion_metrics`. To regenerate the `.sql` file after editing the builder script, run `node scripts/sql/generate-case-study-cohort-sql.js` from the repo root.

**Frozen results row** for the report run: **Appendix B** (tables + JSON).

---

# Appendix B — Hikr cohort: full SQL output row (`hikr_12k`)

**Filter:** `data_source = 'hikr_12k'`. **Denominator for `pct_`*:** 9,550 tracks.

**Prefix legend**


| Prefix | Table / origin            |
| ------ | ------------------------- |
| `im_`  | `ingestion_metrics`       |
| `tr_`  | `tracks` (summary fields) |
| `tm_`  | `temporal_metrics`        |
| `sm_`  | `sampling_metrics`        |
| `mo_`  | `motion_metrics`          |


**B.1 — Cohort**


| SQL output column    | Value |
| -------------------- | ----- |
| `cohort_track_count` | 9550  |


**B.2 — Ingestion (`im_`)**


| SQL output column                       | Value            |
| --------------------------------------- | ---------------- |
| `pct_im_rejected_point_count_gt0`       | 0.0000           |
| `max_im_rejected_point_count`           | 0                |
| `p95_im_rejected_point_count`           | 0                |
| `pct_im_point_type_wpt_count_gt0`       | 15.2356          |
| `max_im_point_type_wpt_count`           | 2611             |
| `p95_im_point_type_wpt_count`           | 12               |
| `pct_im_point_type_rtept_count_gt0`     | 5.1832           |
| `max_im_point_type_rtept_count`         | 13575            |
| `p95_im_point_type_rtept_count`         | 107.099999999999 |
| `pct_im_point_type_trkpt_count_gt0`     | 94.8901          |
| `max_im_point_type_trkpt_count`         | 6342             |
| `p95_im_point_type_trkpt_count`         | 319              |
| `pct_im_has_multiple_point_types_true`  | 15.2565          |
| `pct_im_has_any_timestamp_values_true`  | 85.3089          |
| `pct_im_has_any_timestamp_values_false` | 14.6911          |
| `max_im_total_point_count`              | 13575            |
| `p95_im_total_point_count`              | 530.099999999999 |
| `max_im_valid_point_count`              | 13575            |
| `p95_im_valid_point_count`              | 530.099999999999 |


**B.3 — Tracks summary (`tr_`)**


| SQL output column                  | Value            |
| ---------------------------------- | ---------------- |
| `max_tr_summary_total_point_count` | 13575            |
| `p95_tr_summary_total_point_count` | 530.099999999999 |


**B.4 — Temporal (`tm_`)**


| SQL output column                                       | Value             |
| ------------------------------------------------------- | ----------------- |
| `max_tm_total_points_evaluated`                         | 13575             |
| `p95_tm_total_points_evaluated`                         | 530.099999999999  |
| `pct_tm_raw_session_duration_sec_not_null`              | 85.3089           |
| `max_tm_raw_session_duration_sec`                       | 1428352451        |
| `p95_tm_raw_session_duration_sec`                       | 61219.0999999995  |
| `max_tm_parseable_timestamp_point_count`                | 11434             |
| `p95_tm_parseable_timestamp_point_count`                | 402               |
| `max_tm_monotonic_forward_count`                        | 6028              |
| `p95_tm_monotonic_forward_count`                        | 312               |
| `pct_tm_missing_point_count_gt0`                        | 19.4136           |
| `max_tm_missing_point_count`                            | 13575             |
| `p95_tm_missing_point_count`                            | 202.55            |
| `pct_tm_missing_ratio_gt0`                              | 19.4136           |
| `max_tm_missing_point_count_over_total_points_ratio`    | 1                 |
| `p95_tm_missing_point_count_over_total_points_ratio`    | 1                 |
| `max_tm_missing_max_block_length`                       | 13575             |
| `p95_tm_missing_max_block_length`                       | 201               |
| `max_tm_missing_isolated_point_count`                   | 9                 |
| `p95_tm_missing_isolated_point_count`                   | 0                 |
| `pct_tm_unparsable_point_count_gt0`                     | 0.0105            |
| `max_tm_unparsable_point_count`                         | 1882              |
| `p95_tm_unparsable_point_count`                         | 0                 |
| `pct_tm_unparsable_ratio_gt0`                           | 0.0105            |
| `max_tm_unparsable_point_count_over_total_points_ratio` | 0.562799043062201 |
| `p95_tm_unparsable_point_count_over_total_points_ratio` | 0                 |
| `max_tm_unparsable_max_block_length`                    | 1882              |
| `p95_tm_unparsable_max_block_length`                    | 0                 |
| `max_tm_unparsable_isolated_point_count`                | 0                 |
| `p95_tm_unparsable_isolated_point_count`                | 0                 |
| `pct_tm_duplicate_point_count_gt0`                      | 4.1466            |
| `max_tm_duplicate_point_count`                          | 5405              |
| `p95_tm_duplicate_point_count`                          | 0                 |
| `pct_tm_duplicate_ratio_gt0`                            | 4.1466            |
| `max_tm_duplicate_point_count_over_total_points_ratio`  | 0.998233215547703 |
| `p95_tm_duplicate_point_count_over_total_points_ratio`  | 0                 |
| `max_tm_duplicate_max_block_length`                     | 1211              |
| `p95_tm_duplicate_max_block_length`                     | 0                 |
| `max_tm_duplicate_isolated_point_count`                 | 2512              |
| `p95_tm_duplicate_isolated_point_count`                 | 0                 |
| `pct_tm_backtracking_point_count_gt0`                   | 14.9005           |
| `max_tm_backtracking_point_count`                       | 3265              |
| `p95_tm_backtracking_point_count`                       | 202               |
| `max_tm_backtracking_max_depth_from_anchor_ms`          | 268545344000      |
| `p95_tm_backtracking_max_depth_from_anchor_ms`          | 143526250000      |
| `max_tm_backtracking_max_block_length`                  | 3262              |
| `p95_tm_backtracking_max_block_length`                  | 198               |
| `max_tm_backtracking_isolated_point_count`              | 7                 |
| `p95_tm_backtracking_isolated_point_count`              | 0                 |


**B.5 — Sampling (`sm_`)**


| SQL output column                                         | Value              |
| --------------------------------------------------------- | ------------------ |
| `pct_sm_has_any_parseable_timestamp_true`                 | 85.3089            |
| `pct_sm_has_any_positive_time_delta_true`                 | 84.8168            |
| `max_sm_timestamped_points_count`                         | 11434              |
| `p95_sm_timestamped_points_count`                         | 402                |
| `max_sm_consecutive_timestamp_pairs_count`                | 11433              |
| `p95_sm_consecutive_timestamp_pairs_count`                | 401                |
| `max_sm_positive_time_delta_count`                        | 6028               |
| `p95_sm_positive_time_delta_count`                        | 369.099999999999   |
| `pct_sm_non_positive_time_delta_pair_count_gt0`           | 17.8743            |
| `max_sm_non_positive_time_delta_pair_count`               | 5405               |
| `p95_sm_non_positive_time_delta_pair_count`               | 6                  |
| `max_sm_positive_delta_count`                             | 6028               |
| `p95_sm_positive_delta_count`                             | 369.099999999999   |
| `max_sm_delta_min_ms`                                     | 34558000           |
| `p95_sm_delta_min_ms`                                     | 30000              |
| `max_sm_delta_max_ms`                                     | 1428329163000      |
| `p95_sm_delta_max_ms`                                     | 77837649.9999999   |
| `max_sm_delta_median_ms`                                  | 81735000           |
| `p95_sm_delta_median_ms`                                  | 147000             |
| `max_sm_insertion_relative_threshold`                     | 0.02               |
| `p95_sm_insertion_relative_threshold`                     | 0.02               |
| `max_sm_sorted_cluster_count`                             | 239                |
| `p95_sm_sorted_cluster_count`                             | 98                 |
| `max_sm_sequential_cluster_count`                         | 2035               |
| `p95_sm_sequential_cluster_count`                         | 358.099999999999   |
| `pct_sm_sorted_cluster_ratio_gt0`                         | 84.8168            |
| `max_sm_sorted_cluster_count_over_total_deltas_ratio`     | 1                  |
| `p95_sm_sorted_cluster_count_over_total_deltas_ratio`     | 0.578947368421053  |
| `pct_sm_sequential_cluster_ratio_gt0`                     | 84.8168            |
| `max_sm_sequential_cluster_count_over_total_deltas_ratio` | 1                  |
| `p95_sm_sequential_cluster_count_over_total_deltas_ratio` | 0.996938555347092  |
| `max_sm_sequential_over_sorted_cluster_count_ratio`       | 272.75             |
| `p95_sm_sequential_over_sorted_cluster_count_ratio`       | 5.48169371196754   |
| `max_sm_mean_final_absolute_deviation_sec`                | 35378.774566474    |
| `p95_sm_mean_final_absolute_deviation_sec`                | 0.886904761904762  |
| `max_sm_max_final_absolute_deviation_sec`                 | 3829836            |
| `p95_sm_max_final_absolute_deviation_sec`                 | 15.5               |
| `max_sm_mean_final_relative_deviation`                    | 0.0082113521124776 |
| `p95_sm_mean_final_relative_deviation`                    | 0.0048845109939514 |
| `max_sm_max_final_relative_deviation`                     | 0.0538461538461538 |
| `p95_sm_max_final_relative_deviation`                     | 0.0336692951473881 |
| `max_sm_non_zero_final_deviation_count`                   | 997                |
| `p95_sm_non_zero_final_deviation_count`                   | 140                |
| `max_sm_zero_final_deviation_count`                       | 6028               |
| `p95_sm_zero_final_deviation_count`                       | 251                |
| `max_sm_distance_consecutive_pair_count`                  | 13574              |
| `p95_sm_distance_consecutive_pair_count`                  | 529.099999999999   |
| `pct_sm_invalid_distance_rejection_count_gt0`             | 0.0000             |
| `max_sm_invalid_distance_rejection_count`                 | 0                  |
| `p95_sm_invalid_distance_rejection_count`                 | 0                  |
| `max_sm_geometry_conditioned_delta_count`                 | 13574              |
| `p95_sm_geometry_conditioned_delta_count`                 | 529.099999999999   |
| `max_sm_time_conditioned_delta_count`                     | 6028               |
| `p95_sm_time_conditioned_delta_count`                     | 369.099999999999   |


**B.6 — Motion (`mo_`)**


| SQL output column                             | Value             |
| --------------------------------------------- | ----------------- |
| `max_mo_consecutive_pair_count`               | 11433             |
| `p95_mo_consecutive_pair_count`               | 410               |
| `max_mo_forward_valid_pair_count`             | 6028              |
| `p95_mo_forward_valid_pair_count`             | 369.099999999999  |
| `pct_mo_missing_timestamp_pair_count_gt0`     | 3.1937            |
| `max_mo_missing_timestamp_pair_count`         | 1280              |
| `p95_mo_missing_timestamp_pair_count`         | 0                 |
| `pct_mo_unparsable_timestamp_pair_count_gt0`  | 0.0000            |
| `max_mo_unparsable_timestamp_pair_count`      | 0                 |
| `p95_mo_unparsable_timestamp_pair_count`      | 0                 |
| `pct_mo_non_finite_distance_pair_count_gt0`   | 0.0000            |
| `max_mo_non_finite_distance_pair_count`       | 0                 |
| `p95_mo_non_finite_distance_pair_count`       | 0                 |
| `pct_mo_backward_time_pair_count_gt0`         | 14.9005           |
| `max_mo_backward_time_pair_count`             | 3265              |
| `p95_mo_backward_time_pair_count`             | 2                 |
| `pct_mo_zero_time_delta_pair_count_gt0`       | 4.1466            |
| `max_mo_zero_time_delta_pair_count`           | 5405              |
| `p95_mo_zero_time_delta_pair_count`           | 0                 |
| `max_mo_valid_motion_time_seconds`            | 5665105431        |
| `p95_mo_valid_motion_time_seconds`            | 108776.2          |
| `max_mo_invalid_time_seconds`                 | 5482529725        |
| `p95_mo_invalid_time_seconds`                 | 89099.2499999997  |
| `pct_mo_invalid_time_share_gt0`               | 14.9005           |
| `max_mo_invalid_time_share_of_evaluated_time` | 1                 |
| `p95_mo_invalid_time_share_of_evaluated_time` | 0.479840953997718 |
| `max_mo_total_forward_valid_distance_meters`  | 31891439.0413763  |
| `p95_mo_total_forward_valid_distance_meters`  | 32783.3501277666  |
| `pct_mo_mean_speed_mps_not_null`              | 84.8168           |
| `max_mo_mean_speed_mps`                       | 2172.88540174261  |
| `p95_mo_mean_speed_mps`                       | 1.60285247865395  |
| `pct_mo_median_speed_mps_not_null`            | 84.8168           |
| `max_mo_median_speed_mps`                     | 94.1794785899851  |
| `p95_mo_median_speed_mps`                     | 2.11340459968603  |
| `pct_mo_max_speed_mps_not_null`               | 84.8168           |
| `max_mo_max_speed_mps`                        | 5313111.4200734   |
| `p95_mo_max_speed_mps`                        | 27.1553662600745  |


**B.7 — Machine-readable row (JSON)**

```json
{
  "cohort_track_count": 9550,
  "pct_im_rejected_point_count_gt0": "0.0000",
  "max_im_rejected_point_count": 0,
  "p95_im_rejected_point_count": 0,
  "pct_im_point_type_wpt_count_gt0": "15.2356",
  "max_im_point_type_wpt_count": 2611,
  "p95_im_point_type_wpt_count": 12,
  "pct_im_point_type_rtept_count_gt0": "5.1832",
  "max_im_point_type_rtept_count": 13575,
  "p95_im_point_type_rtept_count": 107.099999999999,
  "pct_im_point_type_trkpt_count_gt0": "94.8901",
  "max_im_point_type_trkpt_count": 6342,
  "p95_im_point_type_trkpt_count": 319,
  "pct_im_has_multiple_point_types_true": "15.2565",
  "pct_im_has_any_timestamp_values_true": "85.3089",
  "pct_im_has_any_timestamp_values_false": "14.6911",
  "max_im_total_point_count": 13575,
  "p95_im_total_point_count": 530.099999999999,
  "max_im_valid_point_count": 13575,
  "p95_im_valid_point_count": 530.099999999999,
  "max_tr_summary_total_point_count": 13575,
  "p95_tr_summary_total_point_count": 530.099999999999,
  "max_tm_total_points_evaluated": 13575,
  "p95_tm_total_points_evaluated": 530.099999999999,
  "pct_tm_raw_session_duration_sec_not_null": "85.3089",
  "max_tm_raw_session_duration_sec": 1428352451,
  "p95_tm_raw_session_duration_sec": 61219.0999999995,
  "max_tm_parseable_timestamp_point_count": 11434,
  "p95_tm_parseable_timestamp_point_count": 402,
  "max_tm_monotonic_forward_count": 6028,
  "p95_tm_monotonic_forward_count": 312,
  "pct_tm_missing_point_count_gt0": "19.4136",
  "max_tm_missing_point_count": 13575,
  "p95_tm_missing_point_count": 202.55,
  "pct_tm_missing_ratio_gt0": "19.4136",
  "max_tm_missing_point_count_over_total_points_ratio": 1,
  "p95_tm_missing_point_count_over_total_points_ratio": 1,
  "max_tm_missing_max_block_length": 13575,
  "p95_tm_missing_max_block_length": 201,
  "max_tm_missing_isolated_point_count": 9,
  "p95_tm_missing_isolated_point_count": 0,
  "pct_tm_unparsable_point_count_gt0": "0.0105",
  "max_tm_unparsable_point_count": 1882,
  "p95_tm_unparsable_point_count": 0,
  "pct_tm_unparsable_ratio_gt0": "0.0105",
  "max_tm_unparsable_point_count_over_total_points_ratio": 0.562799043062201,
  "p95_tm_unparsable_point_count_over_total_points_ratio": 0,
  "max_tm_unparsable_max_block_length": 1882,
  "p95_tm_unparsable_max_block_length": 0,
  "max_tm_unparsable_isolated_point_count": 0,
  "p95_tm_unparsable_isolated_point_count": 0,
  "pct_tm_duplicate_point_count_gt0": "4.1466",
  "max_tm_duplicate_point_count": 5405,
  "p95_tm_duplicate_point_count": 0,
  "pct_tm_duplicate_ratio_gt0": "4.1466",
  "max_tm_duplicate_point_count_over_total_points_ratio": 0.998233215547703,
  "p95_tm_duplicate_point_count_over_total_points_ratio": 0,
  "max_tm_duplicate_max_block_length": 1211,
  "p95_tm_duplicate_max_block_length": 0,
  "max_tm_duplicate_isolated_point_count": 2512,
  "p95_tm_duplicate_isolated_point_count": 0,
  "pct_tm_backtracking_point_count_gt0": "14.9005",
  "max_tm_backtracking_point_count": 3265,
  "p95_tm_backtracking_point_count": 202,
  "max_tm_backtracking_max_depth_from_anchor_ms": 268545344000,
  "p95_tm_backtracking_max_depth_from_anchor_ms": 143526250000,
  "max_tm_backtracking_max_block_length": 3262,
  "p95_tm_backtracking_max_block_length": 198,
  "max_tm_backtracking_isolated_point_count": 7,
  "p95_tm_backtracking_isolated_point_count": 0,
  "pct_sm_has_any_parseable_timestamp_true": "85.3089",
  "pct_sm_has_any_positive_time_delta_true": "84.8168",
  "max_sm_timestamped_points_count": 11434,
  "p95_sm_timestamped_points_count": 402,
  "max_sm_consecutive_timestamp_pairs_count": 11433,
  "p95_sm_consecutive_timestamp_pairs_count": 401,
  "max_sm_positive_time_delta_count": 6028,
  "p95_sm_positive_time_delta_count": 369.099999999999,
  "pct_sm_non_positive_time_delta_pair_count_gt0": "17.8743",
  "max_sm_non_positive_time_delta_pair_count": 5405,
  "p95_sm_non_positive_time_delta_pair_count": 6,
  "max_sm_positive_delta_count": 6028,
  "p95_sm_positive_delta_count": 369.099999999999,
  "max_sm_delta_min_ms": 34558000,
  "p95_sm_delta_min_ms": 30000,
  "max_sm_delta_max_ms": 1428329163000,
  "p95_sm_delta_max_ms": 77837649.9999999,
  "max_sm_delta_median_ms": 81735000,
  "p95_sm_delta_median_ms": 147000,
  "max_sm_insertion_relative_threshold": 0.02,
  "p95_sm_insertion_relative_threshold": 0.02,
  "max_sm_sorted_cluster_count": 239,
  "p95_sm_sorted_cluster_count": 98,
  "max_sm_sequential_cluster_count": 2035,
  "p95_sm_sequential_cluster_count": 358.099999999999,
  "pct_sm_sorted_cluster_ratio_gt0": "84.8168",
  "max_sm_sorted_cluster_count_over_total_deltas_ratio": 1,
  "p95_sm_sorted_cluster_count_over_total_deltas_ratio": 0.578947368421053,
  "pct_sm_sequential_cluster_ratio_gt0": "84.8168",
  "max_sm_sequential_cluster_count_over_total_deltas_ratio": 1,
  "p95_sm_sequential_cluster_count_over_total_deltas_ratio": 0.996938555347092,
  "max_sm_sequential_over_sorted_cluster_count_ratio": 272.75,
  "p95_sm_sequential_over_sorted_cluster_count_ratio": 5.48169371196754,
  "max_sm_mean_final_absolute_deviation_sec": 35378.774566474,
  "p95_sm_mean_final_absolute_deviation_sec": 0.886904761904762,
  "max_sm_max_final_absolute_deviation_sec": 3829836,
  "p95_sm_max_final_absolute_deviation_sec": 15.5,
  "max_sm_mean_final_relative_deviation": 0.0082113521124776,
  "p95_sm_mean_final_relative_deviation": 0.0048845109939514,
  "max_sm_max_final_relative_deviation": 0.0538461538461538,
  "p95_sm_max_final_relative_deviation": 0.0336692951473881,
  "max_sm_non_zero_final_deviation_count": 997,
  "p95_sm_non_zero_final_deviation_count": 140,
  "max_sm_zero_final_deviation_count": 6028,
  "p95_sm_zero_final_deviation_count": 251,
  "max_sm_distance_consecutive_pair_count": 13574,
  "p95_sm_distance_consecutive_pair_count": 529.099999999999,
  "pct_sm_invalid_distance_rejection_count_gt0": "0.0000",
  "max_sm_invalid_distance_rejection_count": 0,
  "p95_sm_invalid_distance_rejection_count": 0,
  "max_sm_geometry_conditioned_delta_count": 13574,
  "p95_sm_geometry_conditioned_delta_count": 529.099999999999,
  "max_sm_time_conditioned_delta_count": 6028,
  "p95_sm_time_conditioned_delta_count": 369.099999999999,
  "max_mo_consecutive_pair_count": 11433,
  "p95_mo_consecutive_pair_count": 410,
  "max_mo_forward_valid_pair_count": 6028,
  "p95_mo_forward_valid_pair_count": 369.099999999999,
  "pct_mo_missing_timestamp_pair_count_gt0": "3.1937",
  "max_mo_missing_timestamp_pair_count": 1280,
  "p95_mo_missing_timestamp_pair_count": 0,
  "pct_mo_unparsable_timestamp_pair_count_gt0": "0.0000",
  "max_mo_unparsable_timestamp_pair_count": 0,
  "p95_mo_unparsable_timestamp_pair_count": 0,
  "pct_mo_non_finite_distance_pair_count_gt0": "0.0000",
  "max_mo_non_finite_distance_pair_count": 0,
  "p95_mo_non_finite_distance_pair_count": 0,
  "pct_mo_backward_time_pair_count_gt0": "14.9005",
  "max_mo_backward_time_pair_count": 3265,
  "p95_mo_backward_time_pair_count": 2,
  "pct_mo_zero_time_delta_pair_count_gt0": "4.1466",
  "max_mo_zero_time_delta_pair_count": 5405,
  "p95_mo_zero_time_delta_pair_count": 0,
  "max_mo_valid_motion_time_seconds": 5665105431,
  "p95_mo_valid_motion_time_seconds": 108776.2,
  "max_mo_invalid_time_seconds": 5482529725,
  "p95_mo_invalid_time_seconds": 89099.2499999997,
  "pct_mo_invalid_time_share_gt0": "14.9005",
  "max_mo_invalid_time_share_of_evaluated_time": 1,
  "p95_mo_invalid_time_share_of_evaluated_time": 0.479840953997718,
  "max_mo_total_forward_valid_distance_meters": 31891439.0413763,
  "p95_mo_total_forward_valid_distance_meters": 32783.3501277666,
  "pct_mo_mean_speed_mps_not_null": "84.8168",
  "max_mo_mean_speed_mps": 2172.88540174261,
  "p95_mo_mean_speed_mps": 1.60285247865395,
  "pct_mo_median_speed_mps_not_null": "84.8168",
  "max_mo_median_speed_mps": 94.1794785899851,
  "p95_mo_median_speed_mps": 2.11340459968603,
  "pct_mo_max_speed_mps_not_null": "84.8168",
  "max_mo_max_speed_mps": 5313111.4200734,
  "p95_mo_max_speed_mps": 27.1553662600745
}
```

