# Supabase V2 Upsert Mapping

Purpose: canonical mapping reference for importing audit JSON into the 5-table relational schema.

Scope:
- `tracks`
- `ingestion_metrics`
- `temporal_metrics`
- `sampling_metrics`
- `motion_metrics`

This file intentionally excludes event/block/cluster arrays (they remain in storage JSON for deep inspection).

## Assumptions

- Input JSON shape is produced by current v2 pipeline (`metadata` + `audit`).
- `track_uid` is derived from file identity (same strategy already used in import script).
- `tracks.track_uid` is unique.
- Child tables are 1:1 with `tracks` via `track_id`.

## Upsert Order

1. Upsert `tracks` using `onConflict: track_uid`, return `id`.
2. Upsert each child row using returned `track_id` and `onConflict: track_id`:
   - `ingestion_metrics`
   - `temporal_metrics`
   - `sampling_metrics`
   - `motion_metrics`

## Nullability/semantics rules

- Preserve `null` when metric is not computable (do not coerce to `0`).
- Keep explicit `0` when computation is valid and value is zero.
- Ratios should remain numeric `[0,1]` where present.

Examples:
- `temporal.session.rawSessionDurationSec`:
  - `0` is valid when first and last parseable timestamps are equal.
  - `null` means not computable (missing parseable endpoints).
- `sampling.time.normalization`:
  - can be `null` when there are no positive deltas.
- `motion.speed.*`:
  - can be `null` when no valid speed samples exist.

---

## Table mapping

## 1) `tracks`

Source JSON root: `metadata`

- `tracks.schema_version` <- `metadata.schemaVersion`
- `tracks.generated_at_utc` <- `metadata.generatedAtUtc` (ISO string -> timestamptz)
- `tracks.source_file_name` <- `metadata.source.fileName`
- `tracks.summary_total_point_count` <- `metadata.summary.totalPointCount`

Storage/hash fields (from importer workflow, not pipeline payload directly):
- `tracks.audit_detail_path` <- storage upload result/path
- `tracks.audit_detail_hash` <- SHA256(audit JSON raw string)
- `tracks.raw_gpx_path` <- storage upload result/path
- `tracks.raw_gpx_hash` <- SHA256(raw GPX content)

External identifier:
- `tracks.track_uid` <- importer-derived UID

Dataset / cohort (not in audit JSON; set by import CLI):
- `tracks.data_source` <- string, e.g. `hikr_12k` (`scripts/import-audit-hikr-12k.js`) or `custom-test` (`scripts/import-audit-adversarial-custom-test.js`)

---

## 2) `ingestion_metrics`

Source JSON root: `audit.ingestion`

- `track_id` <- resolved FK from `tracks.id`
- `total_point_count` <- `audit.ingestion.counts.totalPointCount`
- `valid_point_count` <- `audit.ingestion.counts.validPointCount`
- `rejected_point_count` <- `audit.ingestion.counts.rejectedPointCount`
- `point_type_wpt_count` <- `audit.ingestion.counts.pointTypeCounts.wpt`
- `point_type_rtept_count` <- `audit.ingestion.counts.pointTypeCounts.rtept`
- `point_type_trkpt_count` <- `audit.ingestion.counts.pointTypeCounts.trkpt`
- `has_multiple_point_types` <- `audit.ingestion.context.hasMultiplePointTypes`
- `has_any_timestamp_values` <- `audit.ingestion.context.hasAnyTimestampValues`

Notes:
- Do not map `audit.ingestion.rejections.events` here (storage JSON only).

---

## 3) `temporal_metrics`

Source JSON root: `audit.temporal`

Core:
- `track_id` <- resolved FK
- `total_points_evaluated` <- `audit.temporal.totalPointsEvaluated`
- `raw_session_duration_sec` <- `audit.temporal.session.rawSessionDurationSec`
- `parseable_timestamp_point_count` <- `audit.temporal.session.parseableTimestampPointCount`
- `monotonic_forward_count` <- `audit.temporal.temporalOrder.monotonicForwardCount`

Missing:
- `missing_point_count` <- `audit.temporal.temporalOrder.missing.pointCount`
- `missing_point_count_over_total_points_ratio` <- `audit.temporal.temporalOrder.missing.pointCountOverTotalPointsRatio`
- `missing_max_block_length` <- `audit.temporal.temporalOrder.missing.maxBlockLength`
- `missing_isolated_point_count` <- `audit.temporal.temporalOrder.missing.isolatedPointCount`

Unparsable:
- `unparsable_point_count` <- `audit.temporal.temporalOrder.unparsable.pointCount`
- `unparsable_point_count_over_total_points_ratio` <- `audit.temporal.temporalOrder.unparsable.pointCountOverTotalPointsRatio`
- `unparsable_max_block_length` <- `audit.temporal.temporalOrder.unparsable.maxBlockLength`
- `unparsable_isolated_point_count` <- `audit.temporal.temporalOrder.unparsable.isolatedPointCount`

Duplicate:
- `duplicate_point_count` <- `audit.temporal.temporalOrder.duplicate.pointCount`
- `duplicate_point_count_over_total_points_ratio` <- `audit.temporal.temporalOrder.duplicate.pointCountOverTotalPointsRatio`
- `duplicate_max_block_length` <- `audit.temporal.temporalOrder.duplicate.maxBlockLength`
- `duplicate_isolated_point_count` <- `audit.temporal.temporalOrder.duplicate.isolatedPointCount`

Backtracking:
- `backtracking_point_count` <- `audit.temporal.temporalOrder.backtracking.pointCount`
- `backtracking_max_depth_from_anchor_ms` <- `audit.temporal.temporalOrder.backtracking.maxDepthFromAnchorMs`
- `backtracking_max_block_length` <- `audit.temporal.temporalOrder.backtracking.maxBlockLength`
- `backtracking_isolated_point_count` <- `audit.temporal.temporalOrder.backtracking.isolatedPointCount`

Notes:
- Do not map `blocks` or `isolatedPointEvents` arrays here.

---

## 4) `sampling_metrics`

Source JSON root: `audit.sampling`

Time context:
- `track_id` <- resolved FK
- `has_any_parseable_timestamp` <- `audit.sampling.time.timestampContext.hasAnyParseableTimestamp`
- `has_any_positive_time_delta` <- `audit.sampling.time.timestampContext.hasAnyPositiveTimeDelta`
- `timestamped_points_count` <- `audit.sampling.time.timestampContext.timestampedPointsCount`
- `consecutive_timestamp_pairs_count` <- `audit.sampling.time.timestampContext.consecutiveTimestampPairsCount`
- `positive_time_delta_count` <- `audit.sampling.time.timestampContext.positiveTimeDeltaCount`
- `non_positive_time_delta_pair_count` <- `audit.sampling.time.timestampContext.rejections.nonPositiveTimeDeltaPairs.nonPositivePairCount`

Delta statistics:
- `positive_delta_count` <- `audit.sampling.time.deltaStatistics.positiveDeltaCount`
- `delta_min_ms` <- `audit.sampling.time.deltaStatistics.minMs`
- `delta_max_ms` <- `audit.sampling.time.deltaStatistics.maxMs`
- `delta_median_ms` <- `audit.sampling.time.deltaStatistics.medianMs`

Clustering summary:
- `insertion_relative_threshold` <- `audit.sampling.time.clustering.insertionRelativeThreshold`
- `sorted_cluster_count` <- `audit.sampling.time.clustering.sortedClusterCount`
- `sequential_cluster_count` <- `audit.sampling.time.clustering.sequentialClusterCount`
- `sorted_cluster_count_over_total_deltas_ratio` <- `audit.sampling.time.clustering.sortedClusterCountOverTotalDeltasRatio`
- `sequential_cluster_count_over_total_deltas_ratio` <- `audit.sampling.time.clustering.sequentialClusterCountOverTotalDeltasRatio`
- `sequential_over_sorted_cluster_count_ratio` <- `audit.sampling.time.clustering.sequentialOverSortedClusterCountRatio`

Normalization summary:
- `mean_final_absolute_deviation_sec` <- `audit.sampling.time.normalization.meanFinalAbsoluteDeviationSec`
- `max_final_absolute_deviation_sec` <- `audit.sampling.time.normalization.maxFinalAbsoluteDeviationSec`
- `mean_final_relative_deviation` <- `audit.sampling.time.normalization.meanFinalRelativeDeviation`
- `max_final_relative_deviation` <- `audit.sampling.time.normalization.maxFinalRelativeDeviation`
- `non_zero_final_deviation_count` <- `audit.sampling.time.normalization.nonZeroFinalDeviationCount`
- `zero_final_deviation_count` <- `audit.sampling.time.normalization.zeroFinalDeviationCount`

Distance summary:
- `distance_consecutive_pair_count` <- `audit.sampling.distance.pairInspection.consecutivePairCount`
- `invalid_distance_rejection_count` <- `audit.sampling.distance.pairInspection.rejections.invalidDistance.count`
- `geometry_conditioned_delta_count` <- `audit.sampling.distance.geometryConditioned.deltaCount` (legacy JSON keys `geometryOnly` / `consecutiveGeometry` accepted by importer)
- `time_conditioned_delta_count` <- `audit.sampling.distance.timeConditioned.deltaCount`

Notes:
- If `audit.sampling.time.normalization` is `null`, map all normalization columns to `null`.
- Do not map `clustering.clusters` array or non-positive-delta events array.
- **DB column rename:** If your `sampling_metrics` table still has `geometry_only_delta_count`, rename it to `geometry_conditioned_delta_count` (or add the new column and backfill) before using the updated importer output shape.

---

## 5) `motion_metrics`

Source JSON root: `audit.motion`

Evaluated pairs:
- `track_id` <- resolved FK
- `consecutive_pair_count` <- `audit.motion.evaluatedPairs.consecutivePairCount`
- `forward_valid_pair_count` <- `audit.motion.evaluatedPairs.forwardValidPairCount`

Rejection counts:
- `missing_timestamp_pair_count` <- `audit.motion.rejections.missingTimestampPairCount`
- `unparsable_timestamp_pair_count` <- `audit.motion.rejections.unparsableTimestampPairCount`
- `non_finite_distance_pair_count` <- `audit.motion.rejections.nonFiniteDistancePairCount`
- `backward_time_pair_count` <- `audit.motion.rejections.backwardTimePairCount`
- `zero_time_delta_pair_count` <- `audit.motion.rejections.zeroTimeDeltaPairCount`

Time and distance:
- `valid_motion_time_seconds` <- `audit.motion.time.validMotionTimeSeconds`
- `invalid_time_seconds` <- `audit.motion.time.invalidTimeSeconds`
- `invalid_time_share_of_evaluated_time` <- `audit.motion.time.invalidTimeShareOfEvaluatedTime`
- `total_forward_valid_distance_meters` <- `audit.motion.distance.totalForwardValidDistanceMeters`

Speed:
- `mean_speed_mps` <- `audit.motion.speed.meanSpeedMps`
- `median_speed_mps` <- `audit.motion.speed.medianSpeedMps`
- `max_speed_mps` <- `audit.motion.speed.maxSpeedMps`

Notes:
- Do not map `audit.motion.rejections.events.*` arrays here.

---

## Importer safety checklist

- Validate `metadata.schemaVersion === "2.0.0"` before upsert.
- Use defensive getters and explicit fallback only where semantically correct.
- Never coerce missing objects to fake zeros except where schema defines 0 as meaningful.
- Ensure ratio fields remain in `[0,1]` when numeric; reject row if out-of-bounds.
- Upsert children only after successful `tracks` upsert and FK resolution.

---

## Storage: audit JSON only (no GPX)

To refresh **audit JSON** objects in the `audit-details` bucket (same paths as `auditObjectPath(trackUid, payload)`), without touching `raw-gpx`:

```bash
node scripts/upload-audit-json-to-storage.js --dir runs/csv-v2-full-generate-min100-b500-v2/json
```

Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env`. Uploads with `upsert: true` (replaces existing objects at the same path). Updates `tracks.audit_detail_path` and `tracks.audit_detail_hash` unless `--skip-db-update`.

Options: `--audit-file <path>`, `--limit N`, `--offset N`, `--dry-run`, `--audit-bucket NAME`.

NPM: `npm run upload-audit-json -- --dir <dir> ...`

