-- Case study: one-row cohort aggregates for tracks.data_source = 'hikr_12k'.
-- Keep in sync with docs/reports/case-study-formal-report.md Appendix B column names.
-- Regenerate from source: node scripts/sql/generate-case-study-cohort-sql.js
-- Requires INNER JOIN integrity: every track has rows in all four child tables.
-- Run in Supabase SQL editor (PostgreSQL).

SELECT
  count(*)::bigint AS cohort_track_count
,
  round((100.0 * count(*) FILTER (WHERE im.rejected_point_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_im_rejected_point_count_gt0
,
  max(im.rejected_point_count) AS max_im_rejected_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY im.rejected_point_count) AS p95_im_rejected_point_count
,
  round((100.0 * count(*) FILTER (WHERE im.point_type_wpt_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_im_point_type_wpt_count_gt0
,
  max(im.point_type_wpt_count) AS max_im_point_type_wpt_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY im.point_type_wpt_count) AS p95_im_point_type_wpt_count
,
  round((100.0 * count(*) FILTER (WHERE im.point_type_rtept_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_im_point_type_rtept_count_gt0
,
  max(im.point_type_rtept_count) AS max_im_point_type_rtept_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY im.point_type_rtept_count) AS p95_im_point_type_rtept_count
,
  round((100.0 * count(*) FILTER (WHERE im.point_type_trkpt_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_im_point_type_trkpt_count_gt0
,
  max(im.point_type_trkpt_count) AS max_im_point_type_trkpt_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY im.point_type_trkpt_count) AS p95_im_point_type_trkpt_count
,
  round((100.0 * count(*) FILTER (WHERE im.has_multiple_point_types IS TRUE) / nullif(count(*), 0))::numeric, 4)::text AS pct_im_has_multiple_point_types_true
,
  round((100.0 * count(*) FILTER (WHERE im.has_any_timestamp_values IS TRUE) / nullif(count(*), 0))::numeric, 4)::text AS pct_im_has_any_timestamp_values_true
,
  round((100.0 * count(*) FILTER (WHERE im.has_any_timestamp_values IS NOT TRUE) / nullif(count(*), 0))::numeric, 4)::text AS pct_im_has_any_timestamp_values_false
,
  max(im.total_point_count) AS max_im_total_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY im.total_point_count) AS p95_im_total_point_count
,
  max(im.valid_point_count) AS max_im_valid_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY im.valid_point_count) AS p95_im_valid_point_count
,
  max(t.summary_total_point_count) AS max_tr_summary_total_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY t.summary_total_point_count) AS p95_tr_summary_total_point_count
,
  max(tm.total_points_evaluated) AS max_tm_total_points_evaluated
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.total_points_evaluated) AS p95_tm_total_points_evaluated
,
  round((100.0 * count(*) FILTER (WHERE tm.raw_session_duration_sec IS NOT NULL) / nullif(count(*), 0))::numeric, 4)::text AS pct_tm_raw_session_duration_sec_not_null
,
  max(tm.raw_session_duration_sec) AS max_tm_raw_session_duration_sec
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.raw_session_duration_sec) AS p95_tm_raw_session_duration_sec
,
  max(tm.parseable_timestamp_point_count) AS max_tm_parseable_timestamp_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.parseable_timestamp_point_count) AS p95_tm_parseable_timestamp_point_count
,
  max(tm.monotonic_forward_count) AS max_tm_monotonic_forward_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.monotonic_forward_count) AS p95_tm_monotonic_forward_count
,
  round((100.0 * count(*) FILTER (WHERE tm.missing_point_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_tm_missing_point_count_gt0
,
  max(tm.missing_point_count) AS max_tm_missing_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.missing_point_count) AS p95_tm_missing_point_count
,
  round((100.0 * count(*) FILTER (WHERE tm.missing_point_count_over_total_points_ratio > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_tm_missing_ratio_gt0
,
  max(tm.missing_point_count_over_total_points_ratio) AS max_tm_missing_point_count_over_total_points_ratio
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.missing_point_count_over_total_points_ratio) AS p95_tm_missing_point_count_over_total_points_ratio
,
  max(tm.missing_max_block_length) AS max_tm_missing_max_block_length
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.missing_max_block_length) AS p95_tm_missing_max_block_length
,
  max(tm.missing_isolated_point_count) AS max_tm_missing_isolated_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.missing_isolated_point_count) AS p95_tm_missing_isolated_point_count
,
  round((100.0 * count(*) FILTER (WHERE tm.unparsable_point_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_tm_unparsable_point_count_gt0
,
  max(tm.unparsable_point_count) AS max_tm_unparsable_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.unparsable_point_count) AS p95_tm_unparsable_point_count
,
  round((100.0 * count(*) FILTER (WHERE tm.unparsable_point_count_over_total_points_ratio > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_tm_unparsable_ratio_gt0
,
  max(tm.unparsable_point_count_over_total_points_ratio) AS max_tm_unparsable_point_count_over_total_points_ratio
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.unparsable_point_count_over_total_points_ratio) AS p95_tm_unparsable_point_count_over_total_points_ratio
,
  max(tm.unparsable_max_block_length) AS max_tm_unparsable_max_block_length
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.unparsable_max_block_length) AS p95_tm_unparsable_max_block_length
,
  max(tm.unparsable_isolated_point_count) AS max_tm_unparsable_isolated_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.unparsable_isolated_point_count) AS p95_tm_unparsable_isolated_point_count
,
  round((100.0 * count(*) FILTER (WHERE tm.duplicate_point_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_tm_duplicate_point_count_gt0
,
  max(tm.duplicate_point_count) AS max_tm_duplicate_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.duplicate_point_count) AS p95_tm_duplicate_point_count
,
  round((100.0 * count(*) FILTER (WHERE tm.duplicate_point_count_over_total_points_ratio > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_tm_duplicate_ratio_gt0
,
  max(tm.duplicate_point_count_over_total_points_ratio) AS max_tm_duplicate_point_count_over_total_points_ratio
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.duplicate_point_count_over_total_points_ratio) AS p95_tm_duplicate_point_count_over_total_points_ratio
,
  max(tm.duplicate_max_block_length) AS max_tm_duplicate_max_block_length
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.duplicate_max_block_length) AS p95_tm_duplicate_max_block_length
,
  max(tm.duplicate_isolated_point_count) AS max_tm_duplicate_isolated_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.duplicate_isolated_point_count) AS p95_tm_duplicate_isolated_point_count
,
  round((100.0 * count(*) FILTER (WHERE tm.backtracking_point_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_tm_backtracking_point_count_gt0
,
  max(tm.backtracking_point_count) AS max_tm_backtracking_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.backtracking_point_count) AS p95_tm_backtracking_point_count
,
  max(tm.backtracking_max_depth_from_anchor_ms) AS max_tm_backtracking_max_depth_from_anchor_ms
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.backtracking_max_depth_from_anchor_ms) AS p95_tm_backtracking_max_depth_from_anchor_ms
,
  max(tm.backtracking_max_block_length) AS max_tm_backtracking_max_block_length
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.backtracking_max_block_length) AS p95_tm_backtracking_max_block_length
,
  max(tm.backtracking_isolated_point_count) AS max_tm_backtracking_isolated_point_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tm.backtracking_isolated_point_count) AS p95_tm_backtracking_isolated_point_count
,
  round((100.0 * count(*) FILTER (WHERE sm.has_any_parseable_timestamp IS TRUE) / nullif(count(*), 0))::numeric, 4)::text AS pct_sm_has_any_parseable_timestamp_true
,
  round((100.0 * count(*) FILTER (WHERE sm.has_any_positive_time_delta IS TRUE) / nullif(count(*), 0))::numeric, 4)::text AS pct_sm_has_any_positive_time_delta_true
,
  max(sm.timestamped_points_count) AS max_sm_timestamped_points_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.timestamped_points_count) AS p95_sm_timestamped_points_count
,
  max(sm.consecutive_timestamp_pairs_count) AS max_sm_consecutive_timestamp_pairs_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.consecutive_timestamp_pairs_count) AS p95_sm_consecutive_timestamp_pairs_count
,
  max(sm.positive_time_delta_count) AS max_sm_positive_time_delta_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.positive_time_delta_count) AS p95_sm_positive_time_delta_count
,
  round((100.0 * count(*) FILTER (WHERE sm.non_positive_time_delta_pair_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_sm_non_positive_time_delta_pair_count_gt0
,
  max(sm.non_positive_time_delta_pair_count) AS max_sm_non_positive_time_delta_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.non_positive_time_delta_pair_count) AS p95_sm_non_positive_time_delta_pair_count
,
  max(sm.positive_delta_count) AS max_sm_positive_delta_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.positive_delta_count) AS p95_sm_positive_delta_count
,
  max(sm.delta_min_ms) AS max_sm_delta_min_ms
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.delta_min_ms) AS p95_sm_delta_min_ms
,
  max(sm.delta_max_ms) AS max_sm_delta_max_ms
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.delta_max_ms) AS p95_sm_delta_max_ms
,
  max(sm.delta_median_ms) AS max_sm_delta_median_ms
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.delta_median_ms) AS p95_sm_delta_median_ms
,
  max(sm.insertion_relative_threshold) AS max_sm_insertion_relative_threshold
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.insertion_relative_threshold) AS p95_sm_insertion_relative_threshold
,
  max(sm.sorted_cluster_count) AS max_sm_sorted_cluster_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.sorted_cluster_count) AS p95_sm_sorted_cluster_count
,
  max(sm.sequential_cluster_count) AS max_sm_sequential_cluster_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.sequential_cluster_count) AS p95_sm_sequential_cluster_count
,
  round((100.0 * count(*) FILTER (WHERE sm.sorted_cluster_count_over_total_deltas_ratio > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_sm_sorted_cluster_ratio_gt0
,
  max(sm.sorted_cluster_count_over_total_deltas_ratio) AS max_sm_sorted_cluster_count_over_total_deltas_ratio
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.sorted_cluster_count_over_total_deltas_ratio) AS p95_sm_sorted_cluster_count_over_total_deltas_ratio
,
  round((100.0 * count(*) FILTER (WHERE sm.sequential_cluster_count_over_total_deltas_ratio > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_sm_sequential_cluster_ratio_gt0
,
  max(sm.sequential_cluster_count_over_total_deltas_ratio) AS max_sm_sequential_cluster_count_over_total_deltas_ratio
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.sequential_cluster_count_over_total_deltas_ratio) AS p95_sm_sequential_cluster_count_over_total_deltas_ratio
,
  max(sm.sequential_over_sorted_cluster_count_ratio) AS max_sm_sequential_over_sorted_cluster_count_ratio
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.sequential_over_sorted_cluster_count_ratio) AS p95_sm_sequential_over_sorted_cluster_count_ratio
,
  max(sm.mean_final_absolute_deviation_sec) AS max_sm_mean_final_absolute_deviation_sec
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.mean_final_absolute_deviation_sec) AS p95_sm_mean_final_absolute_deviation_sec
,
  max(sm.max_final_absolute_deviation_sec) AS max_sm_max_final_absolute_deviation_sec
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.max_final_absolute_deviation_sec) AS p95_sm_max_final_absolute_deviation_sec
,
  max(sm.mean_final_relative_deviation) AS max_sm_mean_final_relative_deviation
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.mean_final_relative_deviation) AS p95_sm_mean_final_relative_deviation
,
  max(sm.max_final_relative_deviation) AS max_sm_max_final_relative_deviation
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.max_final_relative_deviation) AS p95_sm_max_final_relative_deviation
,
  max(sm.non_zero_final_deviation_count) AS max_sm_non_zero_final_deviation_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.non_zero_final_deviation_count) AS p95_sm_non_zero_final_deviation_count
,
  max(sm.zero_final_deviation_count) AS max_sm_zero_final_deviation_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.zero_final_deviation_count) AS p95_sm_zero_final_deviation_count
,
  max(sm.distance_consecutive_pair_count) AS max_sm_distance_consecutive_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.distance_consecutive_pair_count) AS p95_sm_distance_consecutive_pair_count
,
  round((100.0 * count(*) FILTER (WHERE sm.invalid_distance_rejection_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_sm_invalid_distance_rejection_count_gt0
,
  max(sm.invalid_distance_rejection_count) AS max_sm_invalid_distance_rejection_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.invalid_distance_rejection_count) AS p95_sm_invalid_distance_rejection_count
,
  max(sm.geometry_conditioned_delta_count) AS max_sm_geometry_conditioned_delta_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.geometry_conditioned_delta_count) AS p95_sm_geometry_conditioned_delta_count
,
  max(sm.time_conditioned_delta_count) AS max_sm_time_conditioned_delta_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY sm.time_conditioned_delta_count) AS p95_sm_time_conditioned_delta_count
,
  max(mo.consecutive_pair_count) AS max_mo_consecutive_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.consecutive_pair_count) AS p95_mo_consecutive_pair_count
,
  max(mo.forward_valid_pair_count) AS max_mo_forward_valid_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.forward_valid_pair_count) AS p95_mo_forward_valid_pair_count
,
  round((100.0 * count(*) FILTER (WHERE mo.missing_timestamp_pair_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_missing_timestamp_pair_count_gt0
,
  max(mo.missing_timestamp_pair_count) AS max_mo_missing_timestamp_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.missing_timestamp_pair_count) AS p95_mo_missing_timestamp_pair_count
,
  round((100.0 * count(*) FILTER (WHERE mo.unparsable_timestamp_pair_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_unparsable_timestamp_pair_count_gt0
,
  max(mo.unparsable_timestamp_pair_count) AS max_mo_unparsable_timestamp_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.unparsable_timestamp_pair_count) AS p95_mo_unparsable_timestamp_pair_count
,
  round((100.0 * count(*) FILTER (WHERE mo.non_finite_distance_pair_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_non_finite_distance_pair_count_gt0
,
  max(mo.non_finite_distance_pair_count) AS max_mo_non_finite_distance_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.non_finite_distance_pair_count) AS p95_mo_non_finite_distance_pair_count
,
  round((100.0 * count(*) FILTER (WHERE mo.backward_time_pair_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_backward_time_pair_count_gt0
,
  max(mo.backward_time_pair_count) AS max_mo_backward_time_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.backward_time_pair_count) AS p95_mo_backward_time_pair_count
,
  round((100.0 * count(*) FILTER (WHERE mo.zero_time_delta_pair_count > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_zero_time_delta_pair_count_gt0
,
  max(mo.zero_time_delta_pair_count) AS max_mo_zero_time_delta_pair_count
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.zero_time_delta_pair_count) AS p95_mo_zero_time_delta_pair_count
,
  max(mo.valid_motion_time_seconds) AS max_mo_valid_motion_time_seconds
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.valid_motion_time_seconds) AS p95_mo_valid_motion_time_seconds
,
  max(mo.invalid_time_seconds) AS max_mo_invalid_time_seconds
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.invalid_time_seconds) AS p95_mo_invalid_time_seconds
,
  round((100.0 * count(*) FILTER (WHERE mo.invalid_time_share_of_evaluated_time > 0) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_invalid_time_share_gt0
,
  max(mo.invalid_time_share_of_evaluated_time) AS max_mo_invalid_time_share_of_evaluated_time
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.invalid_time_share_of_evaluated_time) AS p95_mo_invalid_time_share_of_evaluated_time
,
  max(mo.total_forward_valid_distance_meters) AS max_mo_total_forward_valid_distance_meters
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.total_forward_valid_distance_meters) AS p95_mo_total_forward_valid_distance_meters
,
  round((100.0 * count(*) FILTER (WHERE mo.mean_speed_mps IS NOT NULL) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_mean_speed_mps_not_null
,
  max(mo.mean_speed_mps) AS max_mo_mean_speed_mps
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.mean_speed_mps) AS p95_mo_mean_speed_mps
,
  round((100.0 * count(*) FILTER (WHERE mo.median_speed_mps IS NOT NULL) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_median_speed_mps_not_null
,
  max(mo.median_speed_mps) AS max_mo_median_speed_mps
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.median_speed_mps) AS p95_mo_median_speed_mps
,
  round((100.0 * count(*) FILTER (WHERE mo.max_speed_mps IS NOT NULL) / nullif(count(*), 0))::numeric, 4)::text AS pct_mo_max_speed_mps_not_null
,
  max(mo.max_speed_mps) AS max_mo_max_speed_mps
,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY mo.max_speed_mps) AS p95_mo_max_speed_mps
FROM public.tracks t
INNER JOIN public.ingestion_metrics im ON im.track_id = t.id
INNER JOIN public.temporal_metrics tm ON tm.track_id = t.id
INNER JOIN public.sampling_metrics sm ON sm.track_id = t.id
INNER JOIN public.motion_metrics mo ON mo.track_id = t.id
WHERE t.data_source = 'hikr_12k';
