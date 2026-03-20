#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parseDotEnv(dotEnvPath) {
  if (!fs.existsSync(dotEnvPath)) return;
  const content = fs.readFileSync(dotEnvPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(value) {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return Math.trunc(n);
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function get(obj, objectPath, fallback = undefined) {
  if (!obj) return fallback;
  const steps = objectPath.split(".");
  let cur = obj;
  for (const step of steps) {
    if (cur === null || cur === undefined) return fallback;
    cur = cur[step];
  }
  return cur === undefined ? fallback : cur;
}

function listAuditFilesInDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }
  const files = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".audit.json"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
  return files;
}

function inferTrackUid(filePath, payload) {
  const fileName = path.basename(filePath);
  const nameMatch = fileName.match(/^\d+_([^.]+)\.audit(?:\.v2)?\.json$/i);
  if (nameMatch) return nameMatch[1];
  const uidOnlyMatch = fileName.match(/^([^.]+)\.audit(?:\.v2)?\.json$/i);
  if (uidOnlyMatch) return uidOnlyMatch[1];

  const sourceFileName = get(payload, "metadata.source.fileName");
  if (typeof sourceFileName === "string" && sourceFileName.length > 0) {
    return sourceFileName.replace(/\.gpx$/i, "");
  }

  return fileName.replace(/\.audit(?:\.v2)?\.json$/i, "");
}

function sha256(rawText) {
  return crypto.createHash("sha256").update(rawText, "utf8").digest("hex");
}

function assertRatioInRange(value, fieldName) {
  if (value === null || value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Out-of-range ratio for ${fieldName}: ${value}`);
  }
}

function buildRowsFromAudit(payload, filePath, auditRawText) {
  const ingestion = get(payload, "audit.ingestion", {});
  const temporal = get(payload, "audit.temporal", {});
  const temporalOrder = get(temporal, "temporalOrder", {});
  const sampling = get(payload, "audit.sampling", {});
  const samplingTime = get(sampling, "time", {});
  const samplingDistance = get(sampling, "distance", {});
  const motion = get(payload, "audit.motion", {});
  const motionRejections = get(motion, "rejections", {});

  const trackUid = inferTrackUid(filePath, payload);
  const schemaVersion = get(payload, "metadata.schemaVersion");
  if (schemaVersion !== "2.0.0") {
    throw new Error(`Unsupported schemaVersion=${schemaVersion} (expected 2.0.0)`);
  }

  const missingRatio = toNumberOrNull(get(temporalOrder, "missing.pointCountOverTotalPointsRatio"));
  const unparsableRatio = toNumberOrNull(
    get(temporalOrder, "unparsable.pointCountOverTotalPointsRatio")
  );
  const duplicateRatio = toNumberOrNull(get(temporalOrder, "duplicate.pointCountOverTotalPointsRatio"));
  const invalidTimeRatio = toNumberOrNull(get(motion, "time.invalidTimeShareOfEvaluatedTime"));
  const sortedClusterRatio = toNumberOrNull(
    get(samplingTime, "clustering.sortedClusterCountOverTotalDeltasRatio")
  );
  const sequentialClusterRatio = toNumberOrNull(
    get(samplingTime, "clustering.sequentialClusterCountOverTotalDeltasRatio")
  );

  assertRatioInRange(missingRatio, "temporal.missing.pointCountOverTotalPointsRatio");
  assertRatioInRange(unparsableRatio, "temporal.unparsable.pointCountOverTotalPointsRatio");
  assertRatioInRange(duplicateRatio, "temporal.duplicate.pointCountOverTotalPointsRatio");
  assertRatioInRange(invalidTimeRatio, "motion.time.invalidTimeShareOfEvaluatedTime");
  assertRatioInRange(
    sortedClusterRatio,
    "sampling.time.clustering.sortedClusterCountOverTotalDeltasRatio"
  );
  assertRatioInRange(
    sequentialClusterRatio,
    "sampling.time.clustering.sequentialClusterCountOverTotalDeltasRatio"
  );

  const trackRow = {
    track_uid: trackUid,
    schema_version: schemaVersion,
    generated_at_utc: get(payload, "metadata.generatedAtUtc", null),
    source_file_name: get(payload, "metadata.source.fileName", null),
    summary_total_point_count: toIntOrNull(get(payload, "metadata.summary.totalPointCount", 0)) ?? 0,
    audit_detail_path: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
    audit_detail_hash: sha256(auditRawText),
    raw_gpx_path: null,
    raw_gpx_hash: null,
  };

  const ingestionRow = {
    total_point_count: toIntOrNull(get(ingestion, "counts.totalPointCount", 0)) ?? 0,
    valid_point_count: toIntOrNull(get(ingestion, "counts.validPointCount", 0)) ?? 0,
    rejected_point_count: toIntOrNull(get(ingestion, "counts.rejectedPointCount", 0)) ?? 0,
    point_type_wpt_count: toIntOrNull(get(ingestion, "counts.pointTypeCounts.wpt", 0)) ?? 0,
    point_type_rtept_count: toIntOrNull(get(ingestion, "counts.pointTypeCounts.rtept", 0)) ?? 0,
    point_type_trkpt_count: toIntOrNull(get(ingestion, "counts.pointTypeCounts.trkpt", 0)) ?? 0,
    has_multiple_point_types: toBool(get(ingestion, "context.hasMultiplePointTypes", false), false),
    has_any_timestamp_values: toBool(get(ingestion, "context.hasAnyTimestampValues", false), false),
  };

  const temporalRow = {
    total_points_evaluated: toIntOrNull(get(temporal, "totalPointsEvaluated", 0)) ?? 0,
    raw_session_duration_sec: toNumberOrNull(get(temporal, "session.rawSessionDurationSec")),
    parseable_timestamp_point_count:
      toIntOrNull(get(temporal, "session.parseableTimestampPointCount", 0)) ?? 0,
    monotonic_forward_count: toIntOrNull(get(temporalOrder, "monotonicForwardCount", 0)) ?? 0,

    missing_point_count: toIntOrNull(get(temporalOrder, "missing.pointCount", 0)) ?? 0,
    missing_point_count_over_total_points_ratio: missingRatio ?? 0,
    missing_max_block_length: toIntOrNull(get(temporalOrder, "missing.maxBlockLength", 0)) ?? 0,
    missing_isolated_point_count:
      toIntOrNull(get(temporalOrder, "missing.isolatedPointCount", 0)) ?? 0,

    unparsable_point_count: toIntOrNull(get(temporalOrder, "unparsable.pointCount", 0)) ?? 0,
    unparsable_point_count_over_total_points_ratio: unparsableRatio ?? 0,
    unparsable_max_block_length:
      toIntOrNull(get(temporalOrder, "unparsable.maxBlockLength", 0)) ?? 0,
    unparsable_isolated_point_count:
      toIntOrNull(get(temporalOrder, "unparsable.isolatedPointCount", 0)) ?? 0,

    duplicate_point_count: toIntOrNull(get(temporalOrder, "duplicate.pointCount", 0)) ?? 0,
    duplicate_point_count_over_total_points_ratio: duplicateRatio ?? 0,
    duplicate_max_block_length: toIntOrNull(get(temporalOrder, "duplicate.maxBlockLength", 0)) ?? 0,
    duplicate_isolated_point_count:
      toIntOrNull(get(temporalOrder, "duplicate.isolatedPointCount", 0)) ?? 0,

    backtracking_point_count:
      toIntOrNull(get(temporalOrder, "backtracking.pointCount", 0)) ?? 0,
    backtracking_max_depth_from_anchor_ms:
      toIntOrNull(get(temporalOrder, "backtracking.maxDepthFromAnchorMs")),
    backtracking_max_block_length:
      toIntOrNull(get(temporalOrder, "backtracking.maxBlockLength", 0)) ?? 0,
    backtracking_isolated_point_count:
      toIntOrNull(get(temporalOrder, "backtracking.isolatedPointCount", 0)) ?? 0,
  };

  const normalization = get(samplingTime, "normalization", null);

  const samplingRow = {
    has_any_parseable_timestamp: toBool(
      get(samplingTime, "timestampContext.hasAnyParseableTimestamp", false),
      false
    ),
    has_any_positive_time_delta: toBool(
      get(samplingTime, "timestampContext.hasAnyPositiveTimeDelta", false),
      false
    ),
    timestamped_points_count:
      toIntOrNull(get(samplingTime, "timestampContext.timestampedPointsCount", 0)) ?? 0,
    consecutive_timestamp_pairs_count:
      toIntOrNull(get(samplingTime, "timestampContext.consecutiveTimestampPairsCount", 0)) ?? 0,
    positive_time_delta_count:
      toIntOrNull(get(samplingTime, "timestampContext.positiveTimeDeltaCount", 0)) ?? 0,
    non_positive_time_delta_pair_count:
      toIntOrNull(
        get(
          samplingTime,
          "timestampContext.rejections.nonPositiveTimeDeltaPairs.nonPositivePairCount",
          0
        )
      ) ?? 0,

    positive_delta_count: toIntOrNull(get(samplingTime, "deltaStatistics.positiveDeltaCount", 0)) ?? 0,
    delta_min_ms: toNumberOrNull(get(samplingTime, "deltaStatistics.minMs")),
    delta_max_ms: toNumberOrNull(get(samplingTime, "deltaStatistics.maxMs")),
    delta_median_ms: toNumberOrNull(get(samplingTime, "deltaStatistics.medianMs")),

    insertion_relative_threshold: toNumberOrNull(
      get(samplingTime, "clustering.insertionRelativeThreshold")
    ),
    sorted_cluster_count: toIntOrNull(get(samplingTime, "clustering.sortedClusterCount", 0)) ?? 0,
    sequential_cluster_count:
      toIntOrNull(get(samplingTime, "clustering.sequentialClusterCount", 0)) ?? 0,
    sorted_cluster_count_over_total_deltas_ratio: sortedClusterRatio ?? 0,
    sequential_cluster_count_over_total_deltas_ratio: sequentialClusterRatio ?? 0,
    sequential_over_sorted_cluster_count_ratio:
      toNumberOrNull(get(samplingTime, "clustering.sequentialOverSortedClusterCountRatio")) ?? 0,

    mean_final_absolute_deviation_sec: toNumberOrNull(
      get(normalization, "meanFinalAbsoluteDeviationSec")
    ),
    max_final_absolute_deviation_sec: toNumberOrNull(
      get(normalization, "maxFinalAbsoluteDeviationSec")
    ),
    mean_final_relative_deviation: toNumberOrNull(get(normalization, "meanFinalRelativeDeviation")),
    max_final_relative_deviation: toNumberOrNull(get(normalization, "maxFinalRelativeDeviation")),
    non_zero_final_deviation_count: toIntOrNull(get(normalization, "nonZeroFinalDeviationCount")),
    zero_final_deviation_count: toIntOrNull(get(normalization, "zeroFinalDeviationCount")),

    distance_consecutive_pair_count:
      toIntOrNull(get(samplingDistance, "pairInspection.consecutivePairCount", 0)) ?? 0,
    distance_invalid_distance_rejection_count:
      toIntOrNull(get(samplingDistance, "pairInspection.rejections.invalidDistance.count", 0)) ?? 0,
    geometry_only_delta_count:
      toIntOrNull(get(samplingDistance, "geometryOnly.deltaCount", 0)) ?? 0,
    time_conditioned_delta_count:
      toIntOrNull(get(samplingDistance, "timeConditioned.deltaCount", 0)) ?? 0,
  };

  const motionRow = {
    consecutive_pair_count:
      toIntOrNull(get(motion, "evaluatedPairs.consecutivePairCount", 0)) ?? 0,
    forward_valid_pair_count:
      toIntOrNull(get(motion, "evaluatedPairs.forwardValidPairCount", 0)) ?? 0,

    missing_timestamp_pair_count:
      toIntOrNull(get(motionRejections, "missingTimestampPairCount", 0)) ?? 0,
    unparsable_timestamp_pair_count:
      toIntOrNull(get(motionRejections, "unparsableTimestampPairCount", 0)) ?? 0,
    non_finite_distance_pair_count:
      toIntOrNull(get(motionRejections, "nonFiniteDistancePairCount", 0)) ?? 0,
    backward_time_pair_count:
      toIntOrNull(get(motionRejections, "backwardTimePairCount", 0)) ?? 0,
    zero_time_delta_pair_count:
      toIntOrNull(get(motionRejections, "zeroTimeDeltaPairCount", 0)) ?? 0,

    valid_motion_time_seconds:
      toNumberOrNull(get(motion, "time.validMotionTimeSeconds")) ?? 0,
    invalid_time_seconds: toNumberOrNull(get(motion, "time.invalidTimeSeconds")) ?? 0,
    invalid_time_share_of_evaluated_time: invalidTimeRatio ?? 0,

    total_forward_valid_distance_meters:
      toNumberOrNull(get(motion, "distance.totalForwardValidDistanceMeters")) ?? 0,
    mean_speed_mps: toNumberOrNull(get(motion, "speed.meanSpeedMps")),
    median_speed_mps: toNumberOrNull(get(motion, "speed.medianSpeedMps")),
    max_speed_mps: toNumberOrNull(get(motion, "speed.maxSpeedMps")),
  };

  return { trackRow, ingestionRow, temporalRow, samplingRow, motionRow };
}

function assertEnvForWrite() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("Missing SUPABASE_URL in environment/.env");
  }
  if (!serviceRole) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in environment/.env");
  }
  return { url, serviceRole };
}

async function upsertMappedRows(supabase, rows) {
  const { data: trackUpsert, error: trackError } = await supabase
    .from("tracks")
    .upsert(rows.trackRow, { onConflict: "track_uid" })
    .select("id, track_uid")
    .single();
  if (trackError) {
    throw new Error(`tracks upsert failed: ${trackError.message}`);
  }

  const trackId = trackUpsert.id;
  const ingestionRow = { track_id: trackId, ...rows.ingestionRow };
  const temporalRow = { track_id: trackId, ...rows.temporalRow };
  const samplingRow = { track_id: trackId, ...rows.samplingRow };
  const motionRow = { track_id: trackId, ...rows.motionRow };

  const { error: ingestionError } = await supabase
    .from("ingestion_metrics")
    .upsert(ingestionRow, { onConflict: "track_id" });
  if (ingestionError) {
    throw new Error(`ingestion_metrics upsert failed: ${ingestionError.message}`);
  }

  const { error: temporalError } = await supabase
    .from("temporal_metrics")
    .upsert(temporalRow, { onConflict: "track_id" });
  if (temporalError) {
    throw new Error(`temporal_metrics upsert failed: ${temporalError.message}`);
  }

  const { error: samplingError } = await supabase
    .from("sampling_metrics")
    .upsert(samplingRow, { onConflict: "track_id" });
  if (samplingError) {
    throw new Error(`sampling_metrics upsert failed: ${samplingError.message}`);
  }

  const { error: motionError } = await supabase
    .from("motion_metrics")
    .upsert(motionRow, { onConflict: "track_id" });
  if (motionError) {
    throw new Error(`motion_metrics upsert failed: ${motionError.message}`);
  }

  return { trackId, trackUid: trackUpsert.track_uid };
}

function printDryRunPreview(filePath, rows) {
  const preview = {
    file: path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
    tracks: rows.trackRow,
    ingestion_metrics: rows.ingestionRow,
    temporal_metrics: rows.temporalRow,
    sampling_metrics: rows.samplingRow,
    motion_metrics: rows.motionRow,
  };
  console.log(JSON.stringify(preview, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  parseDotEnv(path.resolve(process.cwd(), ".env"));

  const isDryRun = Boolean(args["dry-run"]);
  const limit = args.limit ? Math.max(0, Number(args.limit)) : null;
  const offset = args.offset ? Math.max(0, Number(args.offset)) : 0;

  const fileArg = args.file ? path.resolve(process.cwd(), args.file) : null;
  const dirArg = args.dir ? path.resolve(process.cwd(), args.dir) : null;

  if (!fileArg && !dirArg) {
    throw new Error("Provide either --file <path> or --dir <path>");
  }
  if (fileArg && dirArg) {
    throw new Error("Use only one of --file or --dir");
  }

  let files = [];
  if (fileArg) {
    if (!fs.existsSync(fileArg)) throw new Error(`File not found: ${fileArg}`);
    files = [fileArg];
  } else {
    files = listAuditFilesInDir(dirArg);
  }

  const sliced = files.slice(offset, limit === null ? undefined : offset + limit);
  if (sliced.length === 0) {
    console.log("No files selected.");
    return;
  }

  let supabase = null;
  if (!isDryRun) {
    const { url, serviceRole } = assertEnvForWrite();
    supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  }

  let success = 0;
  let failed = 0;
  for (const filePath of sliced) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const payload = JSON.parse(raw);
      const rows = buildRowsFromAudit(payload, filePath, raw);

      if (isDryRun) {
        printDryRunPreview(filePath, rows);
      } else {
        const result = await upsertMappedRows(supabase, rows);
        console.log(
          `UPSERT_OK track_uid=${result.trackUid} track_id=${result.trackId} file=${path.basename(
            filePath
          )}`
        );
      }

      success += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `UPSERT_FAIL file=${path.basename(filePath)} reason=${error.message || String(error)}`
      );
    }
  }

  console.log(`DONE selected=${sliced.length} success=${success} failed=${failed} dryRun=${isDryRun}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
