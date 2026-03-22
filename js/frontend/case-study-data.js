import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function toBoolFilterValue(rawValue) {
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  return null;
}

function normalizeRelation(obj, key) {
  if (!obj || !(key in obj)) return null;
  const value = obj[key];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

/**
 * DB may still have NULL data_source on legacy rows. Infer cohort for UI + local filters.
 * Prefer explicit DB value; else custom-test by track_uid prefix; else treat as hikr_12k.
 */
function inferDataSource(row) {
  const raw = row?.data_source;
  if (raw != null && String(raw).trim() !== "") return String(raw);
  const uid = String(row?.track_uid || "");
  if (uid.startsWith("custom-test-")) return "custom-test";
  return "hikr_12k";
}

function normalizeTrackRow(row) {
  const ingestion = normalizeRelation(row, "ingestion_metrics");
  const temporal = normalizeRelation(row, "temporal_metrics");
  const sampling = normalizeRelation(row, "sampling_metrics");
  const motion = normalizeRelation(row, "motion_metrics");
  return {
    id: row.id,
    track_uid: row.track_uid,
    data_source: inferDataSource(row),
    schema_version: row.schema_version,
    generated_at_utc: row.generated_at_utc,
    source_file_name: row.source_file_name,
    summary_total_point_count: row.summary_total_point_count,
    audit_detail_path: row.audit_detail_path,
    raw_gpx_path: row.raw_gpx_path,
    ingestion,
    temporal,
    sampling,
    motion,
  };
}

function getOrderConfig(sortField) {
  if (!sortField) return { column: "id", referencedTable: null };

  if (!sortField.includes(".")) {
    return { column: sortField, referencedTable: null };
  }

  const [relationKey, column] = sortField.split(".", 2);
  switch (relationKey) {
    case "ingestion":
      return { column, referencedTable: "ingestion_metrics" };
    case "temporal":
      return { column, referencedTable: "temporal_metrics" };
    case "sampling":
      return { column, referencedTable: "sampling_metrics" };
    case "motion":
      return { column, referencedTable: "motion_metrics" };
    default:
      return { column: "id", referencedTable: null };
  }
}

function applyRangeFilter(query, column, minValue, maxValue) {
  let next = query;
  if (minValue !== "") next = next.gte(column, Number(minValue));
  if (maxValue !== "") next = next.lte(column, Number(maxValue));
  return next;
}

function applyFilters(query, filters) {
  let next = query;

  if (filters.trackUidContains) {
    next = next.ilike("track_uid", `%${filters.trackUidContains}%`);
  }
  if (filters.sourceFileNameContains) {
    next = next.ilike("source_file_name", `%${filters.sourceFileNameContains}%`);
  }
  if (filters.schemaVersion) {
    next = next.eq("schema_version", filters.schemaVersion);
  }
  if (filters.dataSource && filters.dataSource !== "" && filters.dataSource !== "any") {
    if (filters.dataSource === "hikr_12k") {
      // Legacy rows may have NULL data_source (treat as Hikr); exclude custom-test UIDs.
      next = next.or("data_source.eq.hikr_12k,data_source.is.null");
      next = next.not("track_uid", "like", "custom-test-%");
    } else if (filters.dataSource === "custom-test") {
      next = next.or("data_source.eq.custom-test,track_uid.like.custom-test-%");
    } else {
      next = next.eq("data_source", filters.dataSource);
    }
  }

  next = applyRangeFilter(
    next,
    "summary_total_point_count",
    filters.summaryTotalPointMin,
    filters.summaryTotalPointMax
  );
  next = applyRangeFilter(
    next,
    "ingestion_metrics.valid_point_count",
    filters.ingestionValidPointMin,
    filters.ingestionValidPointMax
  );
  next = applyRangeFilter(
    next,
    "ingestion_metrics.rejected_point_count",
    filters.ingestionRejectedPointMin,
    filters.ingestionRejectedPointMax
  );
  const hasAnyTimestampValues = toBoolFilterValue(filters.hasAnyTimestampValues);
  if (hasAnyTimestampValues !== null) {
    next = next.eq("ingestion_metrics.has_any_timestamp_values", hasAnyTimestampValues);
  }

  next = applyRangeFilter(
    next,
    "temporal_metrics.missing_point_count_over_total_points_ratio",
    filters.missingRatioMin,
    filters.missingRatioMax
  );
  next = applyRangeFilter(
    next,
    "temporal_metrics.unparsable_point_count_over_total_points_ratio",
    filters.unparsableRatioMin,
    filters.unparsableRatioMax
  );
  next = applyRangeFilter(
    next,
    "temporal_metrics.duplicate_point_count_over_total_points_ratio",
    filters.duplicateRatioMin,
    filters.duplicateRatioMax
  );
  if (filters.backtrackingPointCountMin !== "") {
    next = next.gte(
      "temporal_metrics.backtracking_point_count",
      Number(filters.backtrackingPointCountMin)
    );
  }

  const hasAnyPositiveTimeDelta = toBoolFilterValue(filters.hasAnyPositiveTimeDelta);
  if (hasAnyPositiveTimeDelta !== null) {
    next = next.eq("sampling_metrics.has_any_positive_time_delta", hasAnyPositiveTimeDelta);
  }
  next = applyRangeFilter(
    next,
    "sampling_metrics.sequential_over_sorted_cluster_count_ratio",
    filters.sequentialOverSortedClusterRatioMin,
    filters.sequentialOverSortedClusterRatioMax
  );
  if (filters.sortedClusterCountMin !== "") {
    next = next.gte("sampling_metrics.sorted_cluster_count", Number(filters.sortedClusterCountMin));
  }

  next = applyRangeFilter(
    next,
    "motion_metrics.invalid_time_share_of_evaluated_time",
    filters.invalidTimeShareMin,
    filters.invalidTimeShareMax
  );
  if (filters.forwardValidPairCountMin !== "") {
    next = next.gte("motion_metrics.forward_valid_pair_count", Number(filters.forwardValidPairCountMin));
  }

  return next;
}

function normalizeStoragePath(pathValue, bucketName) {
  if (!pathValue) return "";
  const cleaned = String(pathValue).trim().replace(/^\/+/, "");
  if (cleaned.startsWith(`${bucketName}/`)) {
    return cleaned.slice(bucketName.length + 1);
  }
  return cleaned;
}

// sampling_metrics distance counts: geometry_conditioned_* = valid haversine pairs; time_conditioned_* = positive-dt pairs (both columns exist in DB).
const LIST_SELECT = `
id,
track_uid,
schema_version,
generated_at_utc,
source_file_name,
summary_total_point_count,
ingestion_metrics!inner(
  track_id,
  total_point_count,
  valid_point_count,
  rejected_point_count,
  point_type_wpt_count,
  point_type_rtept_count,
  point_type_trkpt_count,
  has_multiple_point_types,
  has_any_timestamp_values
),
temporal_metrics!inner(
  track_id,
  total_points_evaluated,
  raw_session_duration_sec,
  parseable_timestamp_point_count,
  monotonic_forward_count,
  missing_point_count,
  missing_point_count_over_total_points_ratio,
  missing_max_block_length,
  missing_isolated_point_count,
  unparsable_point_count_over_total_points_ratio,
  unparsable_point_count,
  unparsable_max_block_length,
  unparsable_isolated_point_count,
  duplicate_point_count_over_total_points_ratio,
  duplicate_point_count,
  duplicate_max_block_length,
  duplicate_isolated_point_count,
  backtracking_point_count,
  backtracking_max_depth_from_anchor_ms,
  backtracking_max_block_length,
  backtracking_isolated_point_count
),
sampling_metrics!inner(
  track_id,
  has_any_parseable_timestamp,
  has_any_positive_time_delta,
  timestamped_points_count,
  consecutive_timestamp_pairs_count,
  positive_time_delta_count,
  non_positive_time_delta_pair_count,
  positive_delta_count,
  delta_min_ms,
  delta_max_ms,
  delta_median_ms,
  insertion_relative_threshold,
  sorted_cluster_count,
  sequential_cluster_count,
  sorted_cluster_count_over_total_deltas_ratio,
  sequential_cluster_count_over_total_deltas_ratio,
  sequential_over_sorted_cluster_count_ratio,
  mean_final_absolute_deviation_sec,
  max_final_absolute_deviation_sec,
  mean_final_relative_deviation,
  max_final_relative_deviation,
  non_zero_final_deviation_count,
  zero_final_deviation_count,
  distance_consecutive_pair_count,
  invalid_distance_rejection_count,
  geometry_conditioned_delta_count,
  time_conditioned_delta_count
),
motion_metrics!inner(
  track_id,
  consecutive_pair_count,
  forward_valid_pair_count,
  missing_timestamp_pair_count,
  unparsable_timestamp_pair_count,
  non_finite_distance_pair_count,
  backward_time_pair_count,
  zero_time_delta_pair_count,
  valid_motion_time_seconds,
  invalid_time_seconds,
  invalid_time_share_of_evaluated_time,
  total_forward_valid_distance_meters,
  mean_speed_mps,
  median_speed_mps,
  max_speed_mps
)
`;

const DETAIL_SELECT = `
id,
track_uid,
data_source,
schema_version,
generated_at_utc,
source_file_name,
summary_total_point_count,
raw_gpx_path,
audit_detail_path,
ingestion_metrics!inner(*),
temporal_metrics!inner(*),
sampling_metrics!inner(*),
motion_metrics!inner(*)
`;

export function createCaseStudyDataAccess(config) {
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
  });

  return {
    async listAllTracks() {
      const batchSize = Math.max(100, Number(config.fetchBatchSize) || 1000);
      const collected = [];
      let offset = 0;

      for (;;) {
        const { data, error } = await client
          .from("tracks")
          .select(LIST_SELECT)
          .order("id", { ascending: false, nullsFirst: false })
          .range(offset, offset + batchSize - 1);

        if (error) {
          throw new Error(`Track full-cache query failed: ${error.message}`);
        }

        const chunk = (data || []).map(normalizeTrackRow);
        collected.push(...chunk);
        if (chunk.length < batchSize) break;
        offset += batchSize;
      }

      return { rows: collected, totalCount: collected.length };
    },

    async listTracks({ filters, page, pageSize, sort }) {
      const rangeStart = (page - 1) * pageSize;
      const rangeEnd = rangeStart + pageSize - 1;
      const orderConfig = getOrderConfig(sort.field);

      let query = client.from("tracks").select(LIST_SELECT, { count: "exact" });
      query = applyFilters(query, filters);
      query = query.range(rangeStart, rangeEnd);

      if (orderConfig.referencedTable) {
        query = query.order(orderConfig.column, {
          ascending: sort.direction === "asc",
          referencedTable: orderConfig.referencedTable,
          nullsFirst: false,
        });
        // Keep pagination stable when many rows share same metric value.
        query = query.order("id", { ascending: false, nullsFirst: false });
      } else {
        query = query.order(orderConfig.column, {
          ascending: sort.direction === "asc",
          nullsFirst: false,
        });
        query = query.order("id", { ascending: false, nullsFirst: false });
      }

      const { data, error, count } = await query;
      if (error) {
        throw new Error(`Track list query failed: ${error.message}`);
      }

      const rows = (data || []).map(normalizeTrackRow);
      return {
        rows,
        totalCount: count || 0,
      };
    },

    async getTrackDetail(trackUid) {
      const { data, error } = await client
        .from("tracks")
        .select(DETAIL_SELECT)
        .eq("track_uid", trackUid)
        .single();
      if (error) {
        throw new Error(`Track detail query failed: ${error.message}`);
      }
      return normalizeTrackRow(data);
    },

    async downloadAuditJson(pathValue) {
      const objectPath = normalizeStoragePath(pathValue, "audit-details");
      const { data, error } = await client.storage.from("audit-details").download(objectPath);
      if (error) {
        throw new Error(`Audit JSON download failed: ${error.message}`);
      }
      const text = await data.text();
      return JSON.parse(text);
    },

    async downloadRawGpxText(pathValue) {
      const objectPath = normalizeStoragePath(pathValue, "raw-gpx");
      const { data, error } = await client.storage.from("raw-gpx").download(objectPath);
      if (error) {
        throw new Error(`Raw GPX download failed: ${error.message}`);
      }
      return data.text();
    },
  };
}

