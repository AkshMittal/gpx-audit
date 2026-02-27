const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(ROOT, "runs");

function parseArgs() {
  const args = process.argv.slice(2);
  let chunkPrefix = "csv-batch-12000-min101-dedupe-chunk-";
  let reportDir = path.join(RUNS_DIR, "csv-batch-12000-min101-dedupe-study");

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--chunk-prefix" && args[i + 1]) {
      chunkPrefix = args[i + 1];
      i++;
    } else if (arg === "--report-dir" && args[i + 1]) {
      reportDir = path.resolve(args[i + 1]);
      i++;
    }
  }

  return { chunkPrefix, reportDir };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function listChunkDirs(chunkPrefix) {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs.readdirSync(RUNS_DIR)
    .filter((name) => name.startsWith(chunkPrefix))
    .sort()
    .map((name) => path.join(RUNS_DIR, name));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getNested(obj, keys, fallback = null) {
  let cur = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== "object" || !(key in cur)) return fallback;
    cur = cur[key];
  }
  return cur;
}

function percentage(count, denom) {
  if (!denom) return 0;
  return (count / denom) * 100;
}

function fmtPct(count, denom) {
  return `${percentage(count, denom).toFixed(2)}%`;
}

function initCounters(keys) {
  const out = {};
  for (const key of keys) out[key] = 0;
  return out;
}

function increment(counters, key, condition) {
  if (condition) counters[key]++;
}

function toRows(counters, labels, denom) {
  return Object.keys(labels).map((key) => ({
    key,
    label: labels[key],
    count: counters[key],
    pct: percentage(counters[key], denom)
  })).sort((a, b) => b.pct - a.pct);
}

function renderTable(rows, denom) {
  const lines = [];
  lines.push("| Signal | GPX Count | % of analyzed GPX |");
  lines.push("|---|---:|---:|");
  for (const row of rows) {
    lines.push(`| ${row.label} | ${row.count} | ${fmtPct(row.count, denom)} |`);
  }
  return lines;
}

function main() {
  const { chunkPrefix, reportDir } = parseArgs();
  const chunkDirs = listChunkDirs(chunkPrefix);
  if (chunkDirs.length === 0) {
    throw new Error(`No chunk directories found for prefix: ${chunkPrefix}`);
  }

  const summaryTotals = {
    chunkCount: chunkDirs.length,
    selectedCount: 0,
    processedCount: 0,
    passedCount: 0,
    failedCount: 0,
    skippedLowPointsCount: 0,
    skippedDuplicateIdCount: 0,
    skippedDuplicateContentCount: 0
  };

  const timestampKeys = [
    "anyTemporalAnomaly",
    "missingTimestamp",
    "unparsableTimestamp",
    "duplicateTimestamp",
    "backtrackingTimestamp",
    "missingSinglePoint",
    "unparsableSinglePoint",
    "duplicateSinglePoint",
    "backtrackingSinglePoint",
    "missingBlock",
    "unparsableBlock",
    "duplicateBlock",
    "backtrackingBlock",
    "noValidParsedTimestamps"
  ];
  const samplingKeys = [
    "noPositiveTimeDeltas",
    "nonPositiveDeltaRejections",
    "clusterCountSortedGt1",
    "clusterCountSequentialGt1",
    "globalFinalMeanRelativeDeviationGt2Pct",
    "globalFinalMaxRelativeDeviationGt2Pct",
    "samplingStabilityRatioGt1",
    "anySamplingHeterogeneitySignal"
  ];
  const motionKeys = [
    "anyMotionRejection",
    "motionMissingTimestampPairs",
    "motionUnparsableTimestampPairs",
    "motionNonFiniteDistancePairs",
    "motionBackwardPairs",
    "motionZeroTimeDeltaPairs",
    "invalidMotionTimeRatioGt0",
    "noValidMotionTime"
  ];
  const ingestionKeys = [
    "ingestionRejectedPoints",
    "multiplePointTypes",
    "noTimestampsAtIngestion"
  ];

  const timestampCounters = initCounters(timestampKeys);
  const samplingCounters = initCounters(samplingKeys);
  const motionCounters = initCounters(motionKeys);
  const ingestionCounters = initCounters(ingestionKeys);

  let analyzedGpxCount = 0;

  for (const chunkDir of chunkDirs) {
    const manifestPath = path.join(chunkDir, "manifest.json");
    const jsonDir = path.join(chunkDir, "json");
    if (!fs.existsSync(manifestPath) || !fs.existsSync(jsonDir)) continue;

    const manifest = readJson(manifestPath);
    summaryTotals.selectedCount += manifest.selectedCount || 0;
    summaryTotals.processedCount += manifest.processedCount || 0;
    summaryTotals.passedCount += manifest.passedCount || 0;
    summaryTotals.failedCount += manifest.failedCount || 0;
    summaryTotals.skippedLowPointsCount += manifest.skippedLowPointsCount || 0;
    summaryTotals.skippedDuplicateIdCount += manifest.skippedDuplicateIdCount || 0;
    summaryTotals.skippedDuplicateContentCount += manifest.skippedDuplicateContentCount || 0;

    const files = fs.readdirSync(jsonDir).filter((name) => name.endsWith(".audit.json"));
    for (const fileName of files) {
      const payload = readJson(path.join(jsonDir, fileName));
      analyzedGpxCount++;

      const temporalOrder = getNested(payload, ["audit", "temporal", "temporalOrder"], {});
      const temporalSession = getNested(payload, ["audit", "temporal", "session"], {});
      const samplingTime = getNested(payload, ["audit", "sampling", "time"], {});
      const samplingTsCtx = getNested(samplingTime, ["timestampContext"], {});
      const samplingClustering = getNested(samplingTime, ["clustering"], {});
      const samplingNorm = getNested(samplingTime, ["normalization"], {});
      const motion = getNested(payload, ["audit", "motion"], {});
      const motionRej = getNested(motion, ["rejections"], {});
      const motionTime = getNested(motion, ["time"], {});
      const ingestion = getNested(payload, ["audit", "ingestion"], {});
      const ingestionRej = getNested(ingestion, ["rejections"], {});
      const ingestionCtx = getNested(ingestion, ["context"], {});

      const missingCount = getNested(temporalOrder, ["missing", "count"], 0) || 0;
      const unparsableCount = getNested(temporalOrder, ["unparsable", "count"], 0) || 0;
      const duplicateCount = getNested(temporalOrder, ["duplicate", "count"], 0) || 0;
      const backtrackingCount = getNested(temporalOrder, ["backtracking", "count"], 0) || 0;
      const anyTemporal = missingCount > 0 || unparsableCount > 0 || duplicateCount > 0 || backtrackingCount > 0;

      increment(timestampCounters, "anyTemporalAnomaly", anyTemporal);
      increment(timestampCounters, "missingTimestamp", missingCount > 0);
      increment(timestampCounters, "unparsableTimestamp", unparsableCount > 0);
      increment(timestampCounters, "duplicateTimestamp", duplicateCount > 0);
      increment(timestampCounters, "backtrackingTimestamp", backtrackingCount > 0);
      increment(timestampCounters, "missingSinglePoint", (getNested(temporalOrder, ["missing", "singlePointCount"], 0) || 0) > 0);
      increment(timestampCounters, "unparsableSinglePoint", (getNested(temporalOrder, ["unparsable", "singlePointCount"], 0) || 0) > 0);
      increment(timestampCounters, "duplicateSinglePoint", (getNested(temporalOrder, ["duplicate", "singlePointCount"], 0) || 0) > 0);
      increment(timestampCounters, "backtrackingSinglePoint", (getNested(temporalOrder, ["backtracking", "singlePointCount"], 0) || 0) > 0);
      increment(timestampCounters, "missingBlock", (getNested(temporalOrder, ["missing", "blocks"], []) || []).length > 0);
      increment(timestampCounters, "unparsableBlock", (getNested(temporalOrder, ["unparsable", "blocks"], []) || []).length > 0);
      increment(timestampCounters, "duplicateBlock", (getNested(temporalOrder, ["duplicate", "blocks"], []) || []).length > 0);
      increment(timestampCounters, "backtrackingBlock", (getNested(temporalOrder, ["backtracking", "blocks"], []) || []).length > 0);
      increment(timestampCounters, "noValidParsedTimestamps", (getNested(temporalSession, ["validParsedTimestampCount"], 0) || 0) === 0);

      const nonPosDeltaRejections = getNested(samplingTsCtx, ["rejections", "nonPositiveTimeDelta", "count"], 0) || 0;
      const clusterSorted = getNested(samplingClustering, ["clusterCountSorted"], 0) || 0;
      const clusterSequential = getNested(samplingClustering, ["clusterCountSequential"], 0) || 0;
      const gMeanRel = getNested(samplingNorm, ["globalFinalMeanRelativeDeviation"], null);
      const gMaxRel = getNested(samplingNorm, ["globalFinalMaxRelativeDeviation"], null);
      const stability = getNested(samplingClustering, ["samplingStabilityRatio"], 0) || 0;
      const noPositiveDeltas = (getNested(samplingTsCtx, ["positiveTimeDeltasCollected"], 0) || 0) === 0;
      const samplingHeterogeneity =
        clusterSequential > 1 ||
        clusterSorted > 1 ||
        (typeof gMeanRel === "number" && gMeanRel > 0.02) ||
        (typeof gMaxRel === "number" && gMaxRel > 0.02);

      increment(samplingCounters, "noPositiveTimeDeltas", noPositiveDeltas);
      increment(samplingCounters, "nonPositiveDeltaRejections", nonPosDeltaRejections > 0);
      increment(samplingCounters, "clusterCountSortedGt1", clusterSorted > 1);
      increment(samplingCounters, "clusterCountSequentialGt1", clusterSequential > 1);
      increment(samplingCounters, "globalFinalMeanRelativeDeviationGt2Pct", typeof gMeanRel === "number" && gMeanRel > 0.02);
      increment(samplingCounters, "globalFinalMaxRelativeDeviationGt2Pct", typeof gMaxRel === "number" && gMaxRel > 0.02);
      increment(samplingCounters, "samplingStabilityRatioGt1", stability > 1);
      increment(samplingCounters, "anySamplingHeterogeneitySignal", samplingHeterogeneity);

      const missingTsPairs = getNested(motionRej, ["missingTimestampCount"], 0) || 0;
      const unparsableTsPairs = getNested(motionRej, ["unparsableTimestampCount"], 0) || 0;
      const nonFiniteDistPairs = getNested(motionRej, ["nonFiniteDistanceCount"], 0) || 0;
      const backwardPairs = getNested(motionRej, ["backwardCount"], 0) || 0;
      const zeroDeltaPairs = getNested(motionRej, ["zeroTimeDeltaCount"], 0) || 0;
      const anyMotionRej = (missingTsPairs + unparsableTsPairs + nonFiniteDistPairs + backwardPairs + zeroDeltaPairs) > 0;

      increment(motionCounters, "anyMotionRejection", anyMotionRej);
      increment(motionCounters, "motionMissingTimestampPairs", missingTsPairs > 0);
      increment(motionCounters, "motionUnparsableTimestampPairs", unparsableTsPairs > 0);
      increment(motionCounters, "motionNonFiniteDistancePairs", nonFiniteDistPairs > 0);
      increment(motionCounters, "motionBackwardPairs", backwardPairs > 0);
      increment(motionCounters, "motionZeroTimeDeltaPairs", zeroDeltaPairs > 0);
      increment(motionCounters, "invalidMotionTimeRatioGt0", (getNested(motionTime, ["invalidTimeRatio"], 0) || 0) > 0);
      increment(motionCounters, "noValidMotionTime", (getNested(motionTime, ["validMotionTimeSeconds"], 0) || 0) === 0);

      increment(ingestionCounters, "ingestionRejectedPoints", (getNested(ingestionRej, ["count"], 0) || 0) > 0);
      increment(ingestionCounters, "multiplePointTypes", getNested(ingestionCtx, ["hasMultiplePointTypes"], false) === true);
      increment(ingestionCounters, "noTimestampsAtIngestion", getNested(ingestionCtx, ["hasAnyTimestamps"], true) === false);
    }
  }

  const timestampLabels = {
    anyTemporalAnomaly: "Any temporal anomaly (missing/unparsable/duplicate/backtracking)",
    noValidParsedTimestamps: "No valid parsed timestamps in track",
    missingTimestamp: "Missing timestamps present",
    duplicateTimestamp: "Duplicate timestamps present",
    backtrackingTimestamp: "Backtracking timestamps present",
    unparsableTimestamp: "Unparsable timestamps present",
    missingBlock: "Missing timestamp block(s) present (length > 1)",
    duplicateBlock: "Duplicate timestamp block(s) present (length > 1)",
    backtrackingBlock: "Backtracking block(s) present (length > 1)",
    unparsableBlock: "Unparsable timestamp block(s) present (length > 1)",
    missingSinglePoint: "Missing timestamp single-point anomalies present",
    duplicateSinglePoint: "Duplicate timestamp single-point anomalies present",
    backtrackingSinglePoint: "Backtracking single-point anomalies present",
    unparsableSinglePoint: "Unparsable timestamp single-point anomalies present"
  };
  const samplingLabels = {
    anySamplingHeterogeneitySignal: "Any sampling heterogeneity signal",
    clusterCountSequentialGt1: "Sequential cluster count > 1",
    clusterCountSortedGt1: "Sorted cluster count > 1",
    globalFinalMaxRelativeDeviationGt2Pct: "Normalization global max relative deviation > 2%",
    globalFinalMeanRelativeDeviationGt2Pct: "Normalization global mean relative deviation > 2%",
    samplingStabilityRatioGt1: "Sampling stability ratio > 1",
    noPositiveTimeDeltas: "No positive time deltas available",
    nonPositiveDeltaRejections: "Non-positive delta rejections present"
  };
  const motionLabels = {
    anyMotionRejection: "Any motion rejection (time/distance pair checks)",
    invalidMotionTimeRatioGt0: "Invalid motion time ratio > 0",
    noValidMotionTime: "No valid motion time",
    motionMissingTimestampPairs: "Motion missing-timestamp pair rejections",
    motionUnparsableTimestampPairs: "Motion unparsable-timestamp pair rejections",
    motionBackwardPairs: "Motion backward-time pair rejections",
    motionZeroTimeDeltaPairs: "Motion zero-time-delta pair rejections",
    motionNonFiniteDistancePairs: "Motion non-finite-distance pair rejections"
  };
  const ingestionLabels = {
    noTimestampsAtIngestion: "No timestamps at ingestion context",
    ingestionRejectedPoints: "Ingestion rejected points present",
    multiplePointTypes: "Multiple point types in one file"
  };

  const report = {
    scope: {
      chunkPrefix,
      chunkCount: summaryTotals.chunkCount,
      selectedCount: summaryTotals.selectedCount,
      processedCount: summaryTotals.processedCount,
      passedCount: summaryTotals.passedCount,
      failedCount: summaryTotals.failedCount,
      skippedLowPointsCount: summaryTotals.skippedLowPointsCount,
      skippedDuplicateIdCount: summaryTotals.skippedDuplicateIdCount,
      skippedDuplicateContentCount: summaryTotals.skippedDuplicateContentCount,
      analyzedGpxCount
    },
    prevalence: {
      timestamp: toRows(timestampCounters, timestampLabels, analyzedGpxCount),
      sampling: toRows(samplingCounters, samplingLabels, analyzedGpxCount),
      motion: toRows(motionCounters, motionLabels, analyzedGpxCount),
      ingestion: toRows(ingestionCounters, ingestionLabels, analyzedGpxCount)
    }
  };

  ensureDir(reportDir);
  const jsonPath = path.join(reportDir, "prevalence.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const md = [];
  md.push("# 12k GPX Study - Prevalence Report");
  md.push("");
  md.push("## Scope");
  md.push("");
  md.push(`- Chunk prefix: \`${chunkPrefix}\``);
  md.push(`- Chunk runs: ${summaryTotals.chunkCount}`);
  md.push(`- Selected GPX rows: ${summaryTotals.selectedCount}`);
  md.push(`- Processed rows: ${summaryTotals.processedCount}`);
  md.push(`- Passed: ${summaryTotals.passedCount}`);
  md.push(`- Failed: ${summaryTotals.failedCount}`);
  md.push(`- Skipped (low points): ${summaryTotals.skippedLowPointsCount}`);
  md.push(`- Skipped (duplicate id): ${summaryTotals.skippedDuplicateIdCount}`);
  md.push(`- Skipped (duplicate content): ${summaryTotals.skippedDuplicateContentCount}`);
  md.push(`- Analyzed GPX JSON files (denominator for prevalence): ${analyzedGpxCount}`);
  md.push("");

  md.push("## Timestamp Signals");
  md.push("");
  md.push(...renderTable(report.prevalence.timestamp, analyzedGpxCount));
  md.push("");

  md.push("## Sampling Signals");
  md.push("");
  md.push(...renderTable(report.prevalence.sampling, analyzedGpxCount));
  md.push("");

  md.push("## Motion Signals");
  md.push("");
  md.push(...renderTable(report.prevalence.motion, analyzedGpxCount));
  md.push("");

  md.push("## Ingestion Signals");
  md.push("");
  md.push(...renderTable(report.prevalence.ingestion, analyzedGpxCount));
  md.push("");

  md.push("## Notes");
  md.push("");
  md.push("- Prevalence is track-level: a track is counted once per signal if it has at least one occurrence.");
  md.push("- This report measures affected GPX percentage, not total event volume.");
  md.push("- Denominator excludes skipped rows (low points, dedupe skips) because those do not produce audit JSON.");
  md.push("");

  const mdPath = path.join(reportDir, "PREVALENCE-REPORT.md");
  fs.writeFileSync(mdPath, md.join("\n"), "utf8");

  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);
}

main();
