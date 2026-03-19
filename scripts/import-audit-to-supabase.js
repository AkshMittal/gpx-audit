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
  const nameMatch = fileName.match(/^\d+_([^.]+)\.audit\.json$/i);
  if (nameMatch) return nameMatch[1];

  const sourceFileName = get(payload, "metadata.source.fileName");
  if (typeof sourceFileName === "string" && sourceFileName.length > 0) {
    return sourceFileName.replace(/\.gpx$/i, "");
  }

  return fileName.replace(/\.audit\.json$/i, "");
}

function inferSourceRowNumber(filePath) {
  const fileName = path.basename(filePath);
  const seqMatch = fileName.match(/^(\d+)_/);
  if (!seqMatch) return null;
  return toIntOrNull(seqMatch[1]);
}

function buildRowsFromAudit(payload, filePath, options) {
  const ingestion = get(payload, "audit.ingestion", {});
  const temporal = get(payload, "audit.temporal", {});
  const temporalOrder = get(temporal, "temporalOrder", {});
  const sampling = get(payload, "audit.sampling", {});
  const motion = get(payload, "audit.motion", {});

  const trackUid = inferTrackUid(filePath, payload);
  const sourceRowNumber = inferSourceRowNumber(filePath);
  const schemaVersion =
    get(payload, "metadata.schemaVersion") || options.defaultSchemaVersion;

  const totalPointCount = toIntOrNull(get(ingestion, "counts.totalPointCount", 0)) ?? 0;
  const validPointCount = toIntOrNull(get(ingestion, "counts.validPointCount", 0)) ?? 0;
  const rejectedPointCount =
    toIntOrNull(get(ingestion, "counts.rejectedPointCount", 0)) ?? 0;

  const trackRow = {
    track_uid: trackUid,
    source_dataset: options.sourceDataset,
    source_row_number: sourceRowNumber,
    schema_version: schemaVersion,
    total_point_count: totalPointCount,
    valid_point_count: validPointCount,
    rejected_point_count: rejectedPointCount,
    has_multiple_point_types: toBool(
      get(ingestion, "context.hasMultiplePointTypes", false),
      false
    ),
    has_any_timestamps: toBool(get(ingestion, "context.hasAnyTimestamps", false), false),
    raw_gpx_path: null,
    audit_detail_path: path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
    raw_gpx_hash: null,
    audit_detail_hash: crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
  };

  const temporalValidParsedCount =
    toIntOrNull(get(temporal, "session.validParsedTimestampCount", 0)) ?? 0;
  const hasTemporalComparisonContext = temporalValidParsedCount >= 2;

  const missing = get(temporalOrder, "missing", {});
  const unparsable = get(temporalOrder, "unparsable", {});
  const duplicate = get(temporalOrder, "duplicate", {});
  const backtracking = get(temporalOrder, "backtracking", {});

  const missingBlockCount = Array.isArray(missing.blocks) ? missing.blocks.length : 0;
  const unparsableBlockCount = Array.isArray(unparsable.blocks)
    ? unparsable.blocks.length
    : 0;
  const duplicateBlockCount = Array.isArray(duplicate.blocks)
    ? duplicate.blocks.length
    : null;
  const backtrackingBlockCount = Array.isArray(backtracking.blocks)
    ? backtracking.blocks.length
    : null;

  const temporalRow = {
    total_points_checked: toIntOrNull(get(temporal, "totalPointsChecked", 0)) ?? 0,
    valid_parsed_timestamp_count: temporalValidParsedCount,
    has_temporal_comparison_context: hasTemporalComparisonContext,
    raw_session_duration_sec: toNumberOrNull(get(temporal, "session.rawSessionDurationSec")),
    strictly_increasing_count: hasTemporalComparisonContext
      ? toIntOrNull(get(temporalOrder, "strictlyIncreasingCount", 0)) ?? 0
      : null,

    missing_count: toIntOrNull(get(missing, "count", 0)) ?? 0,
    missing_ratio: toNumberOrNull(get(missing, "ratio", 0)) ?? 0,
    missing_largest_block_length: toIntOrNull(get(missing, "largestBlockLength", 0)) ?? 0,
    missing_block_count: missingBlockCount,
    missing_single_point_count: toIntOrNull(get(missing, "singlePointCount", 0)) ?? 0,

    unparsable_count: toIntOrNull(get(unparsable, "count", 0)) ?? 0,
    unparsable_ratio: toNumberOrNull(get(unparsable, "ratio", 0)) ?? 0,
    unparsable_largest_block_length:
      toIntOrNull(get(unparsable, "largestBlockLength", 0)) ?? 0,
    unparsable_block_count: unparsableBlockCount,
    unparsable_single_point_count: toIntOrNull(get(unparsable, "singlePointCount", 0)) ?? 0,

    duplicate_count: hasTemporalComparisonContext
      ? toIntOrNull(get(duplicate, "count", 0)) ?? 0
      : null,
    duplicate_ratio: hasTemporalComparisonContext
      ? toNumberOrNull(get(duplicate, "ratio", 0)) ?? 0
      : null,
    duplicate_largest_block_length: hasTemporalComparisonContext
      ? toIntOrNull(get(duplicate, "largestBlockLength", 0)) ?? 0
      : null,
    duplicate_block_count: hasTemporalComparisonContext
      ? duplicateBlockCount ?? 0
      : null,
    duplicate_single_point_count: hasTemporalComparisonContext
      ? toIntOrNull(get(duplicate, "singlePointCount", 0)) ?? 0
      : null,

    backtracking_count: hasTemporalComparisonContext
      ? toIntOrNull(get(backtracking, "count", 0)) ?? 0
      : null,
    backtracking_max_depth_ms: hasTemporalComparisonContext
      ? toNumberOrNull(get(backtracking, "maxDepthMs"))
      : null,
    backtracking_largest_block_length: hasTemporalComparisonContext
      ? toIntOrNull(get(backtracking, "largestBlockLength", 0)) ?? 0
      : null,
    backtracking_block_count: hasTemporalComparisonContext
      ? backtrackingBlockCount ?? 0
      : null,
    backtracking_single_point_count: hasTemporalComparisonContext
      ? toIntOrNull(get(backtracking, "singlePointCount", 0)) ?? 0
      : null,
  };

  temporalRow.has_any_temporal_anomaly =
    temporalRow.missing_count > 0 ||
    temporalRow.unparsable_count > 0 ||
    (temporalRow.duplicate_count ?? 0) > 0 ||
    (temporalRow.backtracking_count ?? 0) > 0;

  temporalRow.has_any_temporal_block =
    temporalRow.missing_block_count > 0 ||
    temporalRow.unparsable_block_count > 0 ||
    (temporalRow.duplicate_block_count ?? 0) > 0 ||
    (temporalRow.backtracking_block_count ?? 0) > 0;

  temporalRow.has_any_temporal_single_point =
    temporalRow.missing_single_point_count > 0 ||
    temporalRow.unparsable_single_point_count > 0 ||
    (temporalRow.duplicate_single_point_count ?? 0) > 0 ||
    (temporalRow.backtracking_single_point_count ?? 0) > 0;

  const samplingTime = get(sampling, "time", {});
  const timestampContext = get(samplingTime, "timestampContext", {});
  const deltaStats = get(samplingTime, "deltaStatistics", {});
  const clustering = get(samplingTime, "clustering", {});
  const normalization = get(samplingTime, "normalization", {});
  const distance = get(sampling, "distance", {});

  const timestampPairsCount =
    toIntOrNull(get(timestampContext, "consecutiveTimestampPairsCount", 0)) ?? 0;
  const positiveDeltasCount =
    toIntOrNull(get(timestampContext, "positiveTimeDeltasCollected", 0)) ?? 0;
  const hasPositiveDeltaContext = positiveDeltasCount > 0;

  const samplingRow = {
    has_valid_timestamps: toBool(get(timestampContext, "hasValidTimestamps", false), false),
    has_time_progression: toBool(get(timestampContext, "hasTimeProgression", false), false),
    timestamped_points_count:
      toIntOrNull(get(timestampContext, "timestampedPointsCount", 0)) ?? 0,
    consecutive_timestamp_pairs_count: timestampPairsCount,
    positive_time_deltas_collected: positiveDeltasCount,
    non_positive_time_delta_count:
      timestampPairsCount > 0
        ? toIntOrNull(
            get(timestampContext, "rejections.nonPositiveTimeDelta.count", 0)
          ) ?? 0
        : null,

    delta_count: hasPositiveDeltaContext ? toIntOrNull(get(deltaStats, "count", 0)) ?? 0 : null,
    delta_min_ms: hasPositiveDeltaContext ? toNumberOrNull(get(deltaStats, "minMs")) : null,
    delta_median_ms: hasPositiveDeltaContext
      ? toNumberOrNull(get(deltaStats, "medianMs"))
      : null,
    delta_max_ms: hasPositiveDeltaContext ? toNumberOrNull(get(deltaStats, "maxMs")) : null,

    cluster_count_sorted: hasPositiveDeltaContext
      ? toIntOrNull(get(clustering, "clusterCountSorted"))
      : null,
    cluster_count_sequential: hasPositiveDeltaContext
      ? toIntOrNull(get(clustering, "clusterCountSequential"))
      : null,
    sorted_compression_ratio: hasPositiveDeltaContext
      ? toNumberOrNull(get(normalization, "sortedCompressionRatio"))
      : null,
    sequential_compression_ratio: hasPositiveDeltaContext
      ? toNumberOrNull(get(normalization, "sequentialCompressionRatio"))
      : null,
    sampling_stability_ratio: hasPositiveDeltaContext
      ? toNumberOrNull(get(normalization, "samplingStabilityRatio"))
      : null,
    global_final_mean_relative_deviation: hasPositiveDeltaContext
      ? toNumberOrNull(get(normalization, "globalFinalMeanRelativeDeviation"))
      : null,
    global_final_max_relative_deviation: hasPositiveDeltaContext
      ? toNumberOrNull(get(normalization, "globalFinalMaxRelativeDeviation"))
      : null,

    distance_pair_consecutive_count:
      toIntOrNull(get(distance, "pairInspection.consecutivePairCount", 0)) ?? 0,
    distance_invalid_count:
      toIntOrNull(get(distance, "pairInspection.rejections.invalidDistance.count", 0)) ?? 0,
    distance_geometry_only_delta_count:
      toIntOrNull(get(distance, "geometryOnly.deltaCount", 0)) ?? 0,
    distance_time_conditioned_delta_count:
      timestampPairsCount > 0
        ? toIntOrNull(get(distance, "timeConditioned.deltaCount", 0)) ?? 0
        : null,
  };

  const motionPairCounts = get(motion, "pairCounts", {});
  const motionRejections = get(motion, "rejections", {});
  const motionTime = get(motion, "time", {});
  const motionDistance = get(motion, "distance", {});
  const motionSpeed = get(motion, "speed", {});

  const consecutivePairCount =
    toIntOrNull(get(motionPairCounts, "consecutivePairCount", 0)) ?? 0;
  const hasMotionTimeContext = hasTemporalComparisonContext && consecutivePairCount > 0;

  const motionRow = {
    has_motion_time_context: hasMotionTimeContext,
    consecutive_pair_count: consecutivePairCount,

    forward_valid_count: hasMotionTimeContext
      ? toIntOrNull(get(motionPairCounts, "forwardValidCount", 0)) ?? 0
      : null,
    missing_timestamp_count: hasMotionTimeContext
      ? toIntOrNull(get(motionRejections, "missingTimestampCount", 0)) ?? 0
      : null,
    unparsable_timestamp_count: hasMotionTimeContext
      ? toIntOrNull(get(motionRejections, "unparsableTimestampCount", 0)) ?? 0
      : null,
    non_finite_distance_count: hasMotionTimeContext
      ? toIntOrNull(get(motionRejections, "nonFiniteDistanceCount", 0)) ?? 0
      : null,
    backward_count: hasMotionTimeContext
      ? toIntOrNull(get(motionRejections, "backwardCount", 0)) ?? 0
      : null,
    zero_time_delta_count: hasMotionTimeContext
      ? toIntOrNull(get(motionRejections, "zeroTimeDeltaCount", 0)) ?? 0
      : null,

    valid_motion_time_seconds: hasMotionTimeContext
      ? toNumberOrNull(get(motionTime, "validMotionTimeSeconds", 0)) ?? 0
      : null,
    invalid_time_seconds: hasMotionTimeContext
      ? toNumberOrNull(get(motionTime, "invalidTimeSeconds", 0)) ?? 0
      : null,
    invalid_time_ratio: hasMotionTimeContext
      ? toNumberOrNull(get(motionTime, "invalidTimeRatio", 0)) ?? 0
      : null,

    total_valid_distance_meters: hasMotionTimeContext
      ? toNumberOrNull(get(motionDistance, "totalValidDistanceMeters"))
      : null,
    mean_speed_mps: hasMotionTimeContext ? toNumberOrNull(get(motionSpeed, "meanSpeedMps")) : null,
    median_speed_mps: hasMotionTimeContext
      ? toNumberOrNull(get(motionSpeed, "medianSpeedMps"))
      : null,
    max_speed_mps: hasMotionTimeContext ? toNumberOrNull(get(motionSpeed, "maxSpeedMps")) : null,
  };

  if (!hasMotionTimeContext) {
    motionRow.has_any_motion_rejection = null;
  } else {
    motionRow.has_any_motion_rejection =
      (motionRow.missing_timestamp_count ?? 0) > 0 ||
      (motionRow.unparsable_timestamp_count ?? 0) > 0 ||
      (motionRow.non_finite_distance_count ?? 0) > 0 ||
      (motionRow.backward_count ?? 0) > 0 ||
      (motionRow.zero_time_delta_count ?? 0) > 0;
  }

  return { trackRow, temporalRow, samplingRow, motionRow };
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
  const temporalRow = { track_id: trackId, ...rows.temporalRow };
  const samplingRow = { track_id: trackId, ...rows.samplingRow };
  const motionRow = { track_id: trackId, ...rows.motionRow };

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
  const sourceDataset = args["source-dataset"] || "hikr_12k";
  const defaultSchemaVersion = args["default-schema-version"] || "1.0.0";
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

  const options = { sourceDataset, defaultSchemaVersion };
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
      const rows = buildRowsFromAudit(payload, filePath, options);

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
