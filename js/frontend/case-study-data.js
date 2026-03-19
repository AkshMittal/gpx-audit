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

function normalizeTrackRow(row) {
  const temporal = normalizeRelation(row, "temporal_metrics");
  const sampling = normalizeRelation(row, "sampling_metrics");
  const motion = normalizeRelation(row, "motion_metrics");
  return {
    id: row.id,
    track_uid: row.track_uid,
    source_dataset: row.source_dataset,
    total_point_count: row.total_point_count,
    valid_point_count: row.valid_point_count,
    rejected_point_count: row.rejected_point_count,
    has_multiple_point_types: row.has_multiple_point_types,
    has_any_timestamps: row.has_any_timestamps,
    audit_detail_path: row.audit_detail_path,
    raw_gpx_path: row.raw_gpx_path,
    temporal,
    sampling,
    motion,
  };
}

function getOrderConfig(sortField) {
  switch (sortField) {
    case "track_uid":
    case "source_dataset":
    case "valid_point_count":
    case "rejected_point_count":
    case "total_point_count":
      return { column: sortField, referencedTable: null };
    case "missing_ratio":
    case "backtracking_count":
      return { column: sortField, referencedTable: "temporal_metrics" };
    case "sampling_stability_ratio":
    case "cluster_count_sorted":
      return { column: sortField, referencedTable: "sampling_metrics" };
    case "invalid_time_ratio":
      return { column: sortField, referencedTable: "motion_metrics" };
    default:
      return { column: "track_uid", referencedTable: null };
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

  if (filters.sourceDataset) {
    next = next.eq("source_dataset", filters.sourceDataset);
  }
  if (filters.trackUidContains) {
    next = next.ilike("track_uid", `%${filters.trackUidContains}%`);
  }

  next = applyRangeFilter(next, "valid_point_count", filters.validPointMin, filters.validPointMax);
  next = applyRangeFilter(next, "rejected_point_count", filters.rejectedPointMin, filters.rejectedPointMax);

  const temporalAnomaly = toBoolFilterValue(filters.hasAnyTemporalAnomaly);
  if (temporalAnomaly !== null) next = next.eq("temporal_metrics.has_any_temporal_anomaly", temporalAnomaly);

  const temporalBlock = toBoolFilterValue(filters.hasAnyTemporalBlock);
  if (temporalBlock !== null) next = next.eq("temporal_metrics.has_any_temporal_block", temporalBlock);

  const temporalSingle = toBoolFilterValue(filters.hasAnyTemporalSinglePoint);
  if (temporalSingle !== null) next = next.eq("temporal_metrics.has_any_temporal_single_point", temporalSingle);

  next = applyRangeFilter(next, "temporal_metrics.missing_ratio", filters.missingRatioMin, filters.missingRatioMax);
  if (filters.backtrackingCountMin !== "") {
    next = next.gte("temporal_metrics.backtracking_count", Number(filters.backtrackingCountMin));
  }

  const hasTimeProgression = toBoolFilterValue(filters.hasTimeProgression);
  if (hasTimeProgression !== null) next = next.eq("sampling_metrics.has_time_progression", hasTimeProgression);

  next = applyRangeFilter(
    next,
    "sampling_metrics.sampling_stability_ratio",
    filters.samplingStabilityRatioMin,
    filters.samplingStabilityRatioMax
  );
  if (filters.clusterCountSortedMin !== "") {
    next = next.gte("sampling_metrics.cluster_count_sorted", Number(filters.clusterCountSortedMin));
  }

  const hasMotionContext = toBoolFilterValue(filters.hasMotionTimeContext);
  if (hasMotionContext !== null) next = next.eq("motion_metrics.has_motion_time_context", hasMotionContext);

  next = applyRangeFilter(
    next,
    "motion_metrics.invalid_time_ratio",
    filters.invalidTimeRatioMin,
    filters.invalidTimeRatioMax
  );

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

const LIST_SELECT = `
id,
track_uid,
source_dataset,
total_point_count,
valid_point_count,
rejected_point_count,
has_multiple_point_types,
has_any_timestamps,
audit_detail_path,
raw_gpx_path,
temporal_metrics(
  has_any_temporal_anomaly,
  has_any_temporal_block,
  has_any_temporal_single_point,
  missing_ratio,
  backtracking_count,
  missing_count,
  duplicate_count
),
sampling_metrics(
  has_time_progression,
  sampling_stability_ratio,
  cluster_count_sorted,
  global_final_max_relative_deviation
),
motion_metrics(
  has_motion_time_context,
  invalid_time_ratio,
  mean_speed_mps,
  max_speed_mps
)
`;

const DETAIL_SELECT = `
id,
track_uid,
source_dataset,
source_row_number,
schema_version,
total_point_count,
valid_point_count,
rejected_point_count,
has_multiple_point_types,
has_any_timestamps,
raw_gpx_path,
audit_detail_path,
raw_gpx_hash,
audit_detail_hash,
temporal_metrics(*),
sampling_metrics(*),
motion_metrics(*)
`;

export function createCaseStudyDataAccess(config) {
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
  });

  return {
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
      } else {
        query = query.order(orderConfig.column, {
          ascending: sort.direction === "asc",
          nullsFirst: false,
        });
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

