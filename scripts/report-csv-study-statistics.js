const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(ROOT, "runs");

function parseArgs() {
  const args = process.argv.slice(2);
  let chunkPrefix = "csv-batch-12000-min101-gpxindex-v2-chunk-";
  let reportDir = path.join(RUNS_DIR, "csv-batch-12000-min101-gpxindex-v2-study");

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

function get(obj, keys, fallback = null) {
  let cur = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== "object" || !(key in cur)) return fallback;
    cur = cur[key];
  }
  return cur;
}

function pct(count, denom) {
  return denom > 0 ? (count / denom) * 100 : 0;
}

function fmtPct(count, denom) {
  return `${pct(count, denom).toFixed(2)}%`;
}

function percentile(sortedAsc, q) {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sortedAsc[low];
  const w = pos - low;
  return sortedAsc[low] * (1 - w) + sortedAsc[high] * w;
}

function summarizeNumbers(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) {
    return {
      n: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p05: null,
      p25: null,
      p75: null,
      p95: null
    };
  }

  const sorted = nums.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: percentile(sorted, 0.5),
    p05: percentile(sorted, 0.05),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95)
  };
}

function initSignalTracker(names) {
  const tracker = {};
  for (const name of names) tracker[name] = 0;
  return tracker;
}

function toPresenceRows(tracker, labels, denom) {
  return Object.keys(labels).map((k) => ({
    key: k,
    label: labels[k],
    count: tracker[k] || 0,
    percentage: pct(tracker[k] || 0, denom)
  })).sort((a, b) => b.percentage - a.percentage);
}

function inc(map, key, cond) {
  if (cond) map[key] = (map[key] || 0) + 1;
}

function pairKey(a, b) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function renderPresenceTable(rows, denom) {
  const out = [];
  out.push("| Signal | GPX Count | % of analyzed GPX |");
  out.push("|---|---:|---:|");
  for (const row of rows) {
    out.push(`| ${row.label} | ${row.count} | ${fmtPct(row.count, denom)} |`);
  }
  return out;
}

function renderSummaryLine(label, summary) {
  return `- ${label}: n=${summary.n}, median=${summary.median}, p95=${summary.p95}, min=${summary.min}, max=${summary.max}`;
}

function main() {
  const { chunkPrefix, reportDir } = parseArgs();
  const chunkDirs = listChunkDirs(chunkPrefix);
  if (chunkDirs.length === 0) {
    throw new Error(`No chunk directories found for prefix: ${chunkPrefix}`);
  }

  const scope = {
    chunkPrefix,
    chunkRuns: chunkDirs.length,
    selectedCount: 0,
    processedCount: 0,
    passedCount: 0,
    failedCount: 0,
    skippedLowPointsCount: 0,
    skippedDuplicateIdCount: 0,
    skippedDuplicateContentCount: 0,
    analyzedGpxCount: 0
  };

  const ingestionPresenceNames = [
    "hasMultiplePointTypes",
    "hasNoTimestamps",
    "hasRejectedPoints",
    "hasWpt",
    "hasRtept",
    "hasTrkpt"
  ];
  const temporalPresenceNames = [
    "anyTemporalAnomaly",
    "missingPresent",
    "unparsablePresent",
    "duplicatePresent",
    "backtrackingPresent",
    "missingBlockPresent",
    "unparsableBlockPresent",
    "duplicateBlockPresent",
    "backtrackingBlockPresent",
    "missingSinglePointPresent",
    "unparsableSinglePointPresent",
    "duplicateSinglePointPresent",
    "backtrackingSinglePointPresent",
    "noValidParsedTimestamps"
  ];
  const samplingPresenceNames = [
    "hasValidTimestamps",
    "hasTimeProgression",
    "noPositiveDeltas",
    "nonPositiveTimeDeltaRejections",
    "clusterSortedGt1",
    "clusterSequentialGt1",
    "globalFinalMaxRelativeGt2Pct",
    "globalFinalMeanRelativeGt2Pct",
    "samplingStabilityGt1",
    "multiRegimeSignal",
    "distanceInvalidRejections"
  ];
  const motionPresenceNames = [
    "anyMotionRejection",
    "missingTimestampPairs",
    "unparsableTimestampPairs",
    "nonFiniteDistancePairs",
    "backwardPairs",
    "zeroTimeDeltaPairs",
    "invalidTimeRatioGt0",
    "invalidTimeRatioGt0_10",
    "invalidTimeRatioGt0_25",
    "noValidMotionTime"
  ];

  const ingestionPresence = initSignalTracker(ingestionPresenceNames);
  const temporalPresence = initSignalTracker(temporalPresenceNames);
  const samplingPresence = initSignalTracker(samplingPresenceNames);
  const motionPresence = initSignalTracker(motionPresenceNames);

  const numeric = {
    ingestion: {
      totalPointCount: [],
      validPointCount: [],
      rejectedPointCount: []
    },
    temporal: {
      totalPointsChecked: [],
      rawSessionDurationSec: [],
      validParsedTimestampCount: [],
      strictlyIncreasingCount: [],
      missingCount: [],
      missingRatio: [],
      unparsableCount: [],
      unparsableRatio: [],
      duplicateCount: [],
      duplicateRatio: [],
      backtrackingCount: [],
      backtrackingMaxDepthMs: [],
      missingLargestBlockLength: [],
      unparsableLargestBlockLength: [],
      duplicateLargestBlockLength: [],
      backtrackingLargestBlockLength: [],
      missingBlockCount: [],
      unparsableBlockCount: [],
      duplicateBlockCount: [],
      backtrackingBlockCount: [],
      missingSinglePointCount: [],
      unparsableSinglePointCount: [],
      duplicateSinglePointCount: [],
      backtrackingSinglePointCount: []
    },
    sampling: {
      timestampedPointsCount: [],
      consecutiveTimestampPairsCount: [],
      positiveTimeDeltasCollected: [],
      nonPositiveTimeDeltaCount: [],
      deltaCount: [],
      minMs: [],
      medianMs: [],
      maxMs: [],
      clusterCountSorted: [],
      clusterCountSequential: [],
      sortedCompressionRatio: [],
      sequentialCompressionRatio: [],
      samplingStabilityRatio: [],
      globalFinalMeanAbsoluteDeviationSec: [],
      globalFinalMaxAbsoluteDeviationSec: [],
      globalFinalMeanRelativeDeviation: [],
      globalFinalMaxRelativeDeviation: [],
      adjustedCount: [],
      unchangedCount: [],
      distanceConsecutivePairCount: [],
      distanceInvalidCount: [],
      geometryOnlyDeltaCount: [],
      timeConditionedDeltaCount: []
    },
    motion: {
      consecutivePairCount: [],
      forwardValidCount: [],
      missingTimestampCount: [],
      unparsableTimestampCount: [],
      nonFiniteDistanceCount: [],
      backwardCount: [],
      zeroTimeDeltaCount: [],
      validMotionTimeSeconds: [],
      invalidTimeSeconds: [],
      invalidTimeRatio: [],
      totalValidDistanceMeters: [],
      meanSpeedMps: [],
      medianSpeedMps: [],
      maxSpeedMps: []
    }
  };

  const consistency = {
    temporalCheckedEqualsIngestionValid: 0,
    samplingTimestampedLeTemporalValid: 0,
    motionForwardEqSamplingPositive: 0,
    samplingNonPositiveEqMotionBackwardPlusZero: 0,
    samples: 0,
    diffs: {
      motionForwardMinusSamplingPositive: [],
      samplingNonPositiveMinusMotionBackwardPlusZero: []
    }
  };

  const coSignals = [
    "T_missing",
    "T_unparsable",
    "T_duplicate",
    "T_backtracking",
    "S_multiRegime",
    "I_multiPointType",
    "I_noTimestamps",
    "M_nonFiniteDistance",
    "S_invalidDistance"
  ];
  const coSignalCounts = initSignalTracker(coSignals);
  const coPairCounts = {};
  const coSignatures = {};

  const extremes = {
    temporal: {
      highestMissingRatio: { file: null, value: -1 },
      highestDuplicateRatio: { file: null, value: -1 },
      highestBacktrackingCount: { file: null, value: -1 },
      deepestBacktrackingMs: { file: null, value: -1 }
    },
    sampling: {
      highestClusterCountSequential: { file: null, value: -1 },
      highestGlobalMaxRelativeDeviation: { file: null, value: -1 }
    },
    motion: {
      highestInvalidTimeRatio: { file: null, value: -1 },
      highestMaxSpeedMps: { file: null, value: -1 }
    }
  };

  for (const chunkDir of chunkDirs) {
    const manifestPath = path.join(chunkDir, "manifest.json");
    const jsonDir = path.join(chunkDir, "json");
    if (!fs.existsSync(manifestPath) || !fs.existsSync(jsonDir)) continue;

    const manifest = readJson(manifestPath);
    scope.selectedCount += manifest.selectedCount || 0;
    scope.processedCount += manifest.processedCount || 0;
    scope.passedCount += manifest.passedCount || 0;
    scope.failedCount += manifest.failedCount || 0;
    scope.skippedLowPointsCount += manifest.skippedLowPointsCount || 0;
    scope.skippedDuplicateIdCount += manifest.skippedDuplicateIdCount || 0;
    scope.skippedDuplicateContentCount += manifest.skippedDuplicateContentCount || 0;

    const files = fs.readdirSync(jsonDir).filter((n) => n.endsWith(".audit.json"));
    for (const fileName of files) {
      const payloadPath = path.join(jsonDir, fileName);
      const payload = readJson(payloadPath);
      scope.analyzedGpxCount++;
      consistency.samples++;

      const ingestion = get(payload, ["audit", "ingestion"], {});
      const ingestionCounts = get(ingestion, ["counts"], {});
      const ingestionCtx = get(ingestion, ["context"], {});
      const ingestionRej = get(ingestion, ["rejections"], {});
      const ptCounts = get(ingestionCounts, ["pointTypeCounts"], {});

      const temporal = get(payload, ["audit", "temporal"], {});
      const temporalSession = get(temporal, ["session"], {});
      const tOrder = get(temporal, ["temporalOrder"], {});
      const tMissing = get(tOrder, ["missing"], {});
      const tUnparsable = get(tOrder, ["unparsable"], {});
      const tDuplicate = get(tOrder, ["duplicate"], {});
      const tBacktracking = get(tOrder, ["backtracking"], {});

      const sampling = get(payload, ["audit", "sampling"], {});
      const sTime = get(sampling, ["time"], {});
      const sTsCtx = get(sTime, ["timestampContext"], {});
      const sClustering = get(sTime, ["clustering"], {});
      const sNorm = get(sTime, ["normalization"], {});
      const sDistance = get(sampling, ["distance"], {});
      const sPairInspect = get(sDistance, ["pairInspection"], {});
      const sDistanceRej = get(sPairInspect, ["rejections", "invalidDistance"], {});

      const motion = get(payload, ["audit", "motion"], {});
      const mPair = get(motion, ["pairCounts"], {});
      const mRej = get(motion, ["rejections"], {});
      const mTime = get(motion, ["time"], {});
      const mDistance = get(motion, ["distance"], {});
      const mSpeed = get(motion, ["speed"], {});

      const missingCount = get(tMissing, ["count"], 0) || 0;
      const unparsableCount = get(tUnparsable, ["count"], 0) || 0;
      const duplicateCount = get(tDuplicate, ["count"], 0) || 0;
      const backtrackingCount = get(tBacktracking, ["count"], 0) || 0;

      const anyTemporal = missingCount > 0 || unparsableCount > 0 || duplicateCount > 0 || backtrackingCount > 0;

      inc(ingestionPresence, "hasMultiplePointTypes", get(ingestionCtx, ["hasMultiplePointTypes"], false) === true);
      inc(ingestionPresence, "hasNoTimestamps", get(ingestionCtx, ["hasAnyTimestamps"], true) === false);
      inc(ingestionPresence, "hasRejectedPoints", (get(ingestionRej, ["count"], 0) || 0) > 0);
      inc(ingestionPresence, "hasWpt", (get(ptCounts, ["wpt"], 0) || 0) > 0);
      inc(ingestionPresence, "hasRtept", (get(ptCounts, ["rtept"], 0) || 0) > 0);
      inc(ingestionPresence, "hasTrkpt", (get(ptCounts, ["trkpt"], 0) || 0) > 0);

      inc(temporalPresence, "anyTemporalAnomaly", anyTemporal);
      inc(temporalPresence, "missingPresent", missingCount > 0);
      inc(temporalPresence, "unparsablePresent", unparsableCount > 0);
      inc(temporalPresence, "duplicatePresent", duplicateCount > 0);
      inc(temporalPresence, "backtrackingPresent", backtrackingCount > 0);
      inc(temporalPresence, "missingBlockPresent", (get(tMissing, ["blocks"], []) || []).length > 0);
      inc(temporalPresence, "unparsableBlockPresent", (get(tUnparsable, ["blocks"], []) || []).length > 0);
      inc(temporalPresence, "duplicateBlockPresent", (get(tDuplicate, ["blocks"], []) || []).length > 0);
      inc(temporalPresence, "backtrackingBlockPresent", (get(tBacktracking, ["blocks"], []) || []).length > 0);
      inc(temporalPresence, "missingSinglePointPresent", (get(tMissing, ["singlePointCount"], 0) || 0) > 0);
      inc(temporalPresence, "unparsableSinglePointPresent", (get(tUnparsable, ["singlePointCount"], 0) || 0) > 0);
      inc(temporalPresence, "duplicateSinglePointPresent", (get(tDuplicate, ["singlePointCount"], 0) || 0) > 0);
      inc(temporalPresence, "backtrackingSinglePointPresent", (get(tBacktracking, ["singlePointCount"], 0) || 0) > 0);
      inc(temporalPresence, "noValidParsedTimestamps", (get(temporalSession, ["validParsedTimestampCount"], 0) || 0) === 0);

      const hasTimeProgression = get(sTsCtx, ["hasTimeProgression"], false) === true;
      const nonPositiveCount = get(sTsCtx, ["rejections", "nonPositiveTimeDelta", "count"], 0) || 0;
      const clusterSorted = get(sClustering, ["clusterCountSorted"], 0) || 0;
      const clusterSequential = get(sClustering, ["clusterCountSequential"], 0) || 0;
      const gMeanRel = get(sNorm, ["globalFinalMeanRelativeDeviation"], null);
      const gMaxRel = get(sNorm, ["globalFinalMaxRelativeDeviation"], null);
      const stability = get(sClustering, ["samplingStabilityRatio"], 0) || 0;
      const sInvalidDistance = get(sDistanceRej, ["count"], 0) || 0;
      const multiRegimeSignal =
        clusterSequential > 1 ||
        (typeof gMaxRel === "number" && gMaxRel > 0.02);

      inc(samplingPresence, "hasValidTimestamps", get(sTsCtx, ["hasValidTimestamps"], false) === true);
      inc(samplingPresence, "hasTimeProgression", hasTimeProgression);
      inc(samplingPresence, "noPositiveDeltas", (get(sTsCtx, ["positiveTimeDeltasCollected"], 0) || 0) === 0);
      inc(samplingPresence, "nonPositiveTimeDeltaRejections", nonPositiveCount > 0);
      inc(samplingPresence, "clusterSortedGt1", clusterSorted > 1);
      inc(samplingPresence, "clusterSequentialGt1", clusterSequential > 1);
      inc(samplingPresence, "globalFinalMaxRelativeGt2Pct", typeof gMaxRel === "number" && gMaxRel > 0.02);
      inc(samplingPresence, "globalFinalMeanRelativeGt2Pct", typeof gMeanRel === "number" && gMeanRel > 0.02);
      inc(samplingPresence, "samplingStabilityGt1", stability > 1);
      inc(samplingPresence, "multiRegimeSignal", multiRegimeSignal);
      inc(samplingPresence, "distanceInvalidRejections", sInvalidDistance > 0);

      const mMissing = get(mRej, ["missingTimestampCount"], 0) || 0;
      const mUnparsable = get(mRej, ["unparsableTimestampCount"], 0) || 0;
      const mNonFinite = get(mRej, ["nonFiniteDistanceCount"], 0) || 0;
      const mBackward = get(mRej, ["backwardCount"], 0) || 0;
      const mZero = get(mRej, ["zeroTimeDeltaCount"], 0) || 0;
      const mAny = mMissing + mUnparsable + mNonFinite + mBackward + mZero > 0;
      const invalidTimeRatio = get(mTime, ["invalidTimeRatio"], 0) || 0;

      inc(motionPresence, "anyMotionRejection", mAny);
      inc(motionPresence, "missingTimestampPairs", mMissing > 0);
      inc(motionPresence, "unparsableTimestampPairs", mUnparsable > 0);
      inc(motionPresence, "nonFiniteDistancePairs", mNonFinite > 0);
      inc(motionPresence, "backwardPairs", mBackward > 0);
      inc(motionPresence, "zeroTimeDeltaPairs", mZero > 0);
      inc(motionPresence, "invalidTimeRatioGt0", invalidTimeRatio > 0);
      inc(motionPresence, "invalidTimeRatioGt0_10", invalidTimeRatio > 0.1);
      inc(motionPresence, "invalidTimeRatioGt0_25", invalidTimeRatio > 0.25);
      inc(motionPresence, "noValidMotionTime", (get(mTime, ["validMotionTimeSeconds"], 0) || 0) === 0);

      numeric.ingestion.totalPointCount.push(get(ingestionCounts, ["totalPointCount"], null));
      numeric.ingestion.validPointCount.push(get(ingestionCounts, ["validPointCount"], null));
      numeric.ingestion.rejectedPointCount.push(get(ingestionCounts, ["rejectedPointCount"], null));

      numeric.temporal.totalPointsChecked.push(get(temporal, ["totalPointsChecked"], null));
      numeric.temporal.rawSessionDurationSec.push(get(temporalSession, ["rawSessionDurationSec"], null));
      numeric.temporal.validParsedTimestampCount.push(get(temporalSession, ["validParsedTimestampCount"], null));
      numeric.temporal.strictlyIncreasingCount.push(get(tOrder, ["strictlyIncreasingCount"], null));
      numeric.temporal.missingCount.push(missingCount);
      numeric.temporal.missingRatio.push(get(tMissing, ["ratio"], null));
      numeric.temporal.unparsableCount.push(unparsableCount);
      numeric.temporal.unparsableRatio.push(get(tUnparsable, ["ratio"], null));
      numeric.temporal.duplicateCount.push(duplicateCount);
      numeric.temporal.duplicateRatio.push(get(tDuplicate, ["ratio"], null));
      numeric.temporal.backtrackingCount.push(backtrackingCount);
      numeric.temporal.backtrackingMaxDepthMs.push(get(tBacktracking, ["maxDepthMs"], null));
      numeric.temporal.missingLargestBlockLength.push(get(tMissing, ["largestBlockLength"], null));
      numeric.temporal.unparsableLargestBlockLength.push(get(tUnparsable, ["largestBlockLength"], null));
      numeric.temporal.duplicateLargestBlockLength.push(get(tDuplicate, ["largestBlockLength"], null));
      numeric.temporal.backtrackingLargestBlockLength.push(get(tBacktracking, ["largestBlockLength"], null));
      numeric.temporal.missingBlockCount.push((get(tMissing, ["blocks"], []) || []).length);
      numeric.temporal.unparsableBlockCount.push((get(tUnparsable, ["blocks"], []) || []).length);
      numeric.temporal.duplicateBlockCount.push((get(tDuplicate, ["blocks"], []) || []).length);
      numeric.temporal.backtrackingBlockCount.push((get(tBacktracking, ["blocks"], []) || []).length);
      numeric.temporal.missingSinglePointCount.push(get(tMissing, ["singlePointCount"], null));
      numeric.temporal.unparsableSinglePointCount.push(get(tUnparsable, ["singlePointCount"], null));
      numeric.temporal.duplicateSinglePointCount.push(get(tDuplicate, ["singlePointCount"], null));
      numeric.temporal.backtrackingSinglePointCount.push(get(tBacktracking, ["singlePointCount"], null));

      numeric.sampling.timestampedPointsCount.push(get(sTsCtx, ["timestampedPointsCount"], null));
      numeric.sampling.consecutiveTimestampPairsCount.push(get(sTsCtx, ["consecutiveTimestampPairsCount"], null));
      numeric.sampling.positiveTimeDeltasCollected.push(get(sTsCtx, ["positiveTimeDeltasCollected"], null));
      numeric.sampling.nonPositiveTimeDeltaCount.push(nonPositiveCount);
      numeric.sampling.deltaCount.push(get(sTime, ["deltaStatistics", "count"], null));
      numeric.sampling.minMs.push(get(sTime, ["deltaStatistics", "minMs"], null));
      numeric.sampling.medianMs.push(get(sTime, ["deltaStatistics", "medianMs"], null));
      numeric.sampling.maxMs.push(get(sTime, ["deltaStatistics", "maxMs"], null));
      numeric.sampling.clusterCountSorted.push(clusterSorted);
      numeric.sampling.clusterCountSequential.push(clusterSequential);
      numeric.sampling.sortedCompressionRatio.push(get(sClustering, ["sortedCompressionRatio"], null));
      numeric.sampling.sequentialCompressionRatio.push(get(sClustering, ["sequentialCompressionRatio"], null));
      numeric.sampling.samplingStabilityRatio.push(stability);
      numeric.sampling.globalFinalMeanAbsoluteDeviationSec.push(get(sNorm, ["globalFinalMeanAbsoluteDeviationSec"], null));
      numeric.sampling.globalFinalMaxAbsoluteDeviationSec.push(get(sNorm, ["globalFinalMaxAbsoluteDeviationSec"], null));
      numeric.sampling.globalFinalMeanRelativeDeviation.push(gMeanRel);
      numeric.sampling.globalFinalMaxRelativeDeviation.push(gMaxRel);
      numeric.sampling.adjustedCount.push(get(sNorm, ["adjustedCount"], null));
      numeric.sampling.unchangedCount.push(get(sNorm, ["unchangedCount"], null));
      numeric.sampling.distanceConsecutivePairCount.push(get(sPairInspect, ["consecutivePairCount"], null));
      numeric.sampling.distanceInvalidCount.push(sInvalidDistance);
      numeric.sampling.geometryOnlyDeltaCount.push(get(sDistance, ["geometryOnly", "deltaCount"], null));
      numeric.sampling.timeConditionedDeltaCount.push(get(sDistance, ["timeConditioned", "deltaCount"], null));

      numeric.motion.consecutivePairCount.push(get(mPair, ["consecutivePairCount"], null));
      numeric.motion.forwardValidCount.push(get(mPair, ["forwardValidCount"], null));
      numeric.motion.missingTimestampCount.push(mMissing);
      numeric.motion.unparsableTimestampCount.push(mUnparsable);
      numeric.motion.nonFiniteDistanceCount.push(mNonFinite);
      numeric.motion.backwardCount.push(mBackward);
      numeric.motion.zeroTimeDeltaCount.push(mZero);
      numeric.motion.validMotionTimeSeconds.push(get(mTime, ["validMotionTimeSeconds"], null));
      numeric.motion.invalidTimeSeconds.push(get(mTime, ["invalidTimeSeconds"], null));
      numeric.motion.invalidTimeRatio.push(invalidTimeRatio);
      numeric.motion.totalValidDistanceMeters.push(get(mDistance, ["totalValidDistanceMeters"], null));
      numeric.motion.meanSpeedMps.push(get(mSpeed, ["meanSpeedMps"], null));
      numeric.motion.medianSpeedMps.push(get(mSpeed, ["medianSpeedMps"], null));
      numeric.motion.maxSpeedMps.push(get(mSpeed, ["maxSpeedMps"], null));

      const temporalChecked = get(temporal, ["totalPointsChecked"], null);
      const ingestionValid = get(ingestionCounts, ["validPointCount"], null);
      const samplingTimestamped = get(sTsCtx, ["timestampedPointsCount"], null);
      const temporalValidParsed = get(temporalSession, ["validParsedTimestampCount"], null);
      const motionForward = get(mPair, ["forwardValidCount"], null);
      const samplingPositive = get(sTsCtx, ["positiveTimeDeltasCollected"], null);
      const samplingNonPositive = nonPositiveCount;
      const motionBackwardPlusZero = mBackward + mZero;

      if (temporalChecked === ingestionValid) consistency.temporalCheckedEqualsIngestionValid++;
      if (
        typeof samplingTimestamped === "number" &&
        typeof temporalValidParsed === "number" &&
        samplingTimestamped <= temporalValidParsed
      ) consistency.samplingTimestampedLeTemporalValid++;
      if (motionForward === samplingPositive) consistency.motionForwardEqSamplingPositive++;
      if (samplingNonPositive === motionBackwardPlusZero) consistency.samplingNonPositiveEqMotionBackwardPlusZero++;

      if (typeof motionForward === "number" && typeof samplingPositive === "number") {
        consistency.diffs.motionForwardMinusSamplingPositive.push(motionForward - samplingPositive);
      }
      consistency.diffs.samplingNonPositiveMinusMotionBackwardPlusZero.push(
        samplingNonPositive - motionBackwardPlusZero
      );

      const activeSignals = {
        T_missing: missingCount > 0,
        T_unparsable: unparsableCount > 0,
        T_duplicate: duplicateCount > 0,
        T_backtracking: backtrackingCount > 0,
        S_multiRegime: multiRegimeSignal,
        I_multiPointType: get(ingestionCtx, ["hasMultiplePointTypes"], false) === true,
        I_noTimestamps: get(ingestionCtx, ["hasAnyTimestamps"], true) === false,
        M_nonFiniteDistance: mNonFinite > 0,
        S_invalidDistance: sInvalidDistance > 0
      };

      for (const signal of coSignals) {
        if (activeSignals[signal]) coSignalCounts[signal]++;
      }

      const activeList = coSignals.filter((s) => activeSignals[s]);
      const signature = activeList.length > 0 ? activeList.join("|") : "NONE";
      coSignatures[signature] = (coSignatures[signature] || 0) + 1;
      for (let i = 0; i < activeList.length; i++) {
        for (let j = i + 1; j < activeList.length; j++) {
          const k = pairKey(activeList[i], activeList[j]);
          coPairCounts[k] = (coPairCounts[k] || 0) + 1;
        }
      }

      const missingRatio = get(tMissing, ["ratio"], null);
      const duplicateRatio = get(tDuplicate, ["ratio"], null);
      const backtrackingMax = get(tBacktracking, ["maxDepthMs"], null);
      const clusterSeq = clusterSequential;
      const maxRel = gMaxRel;
      const maxSpeed = get(mSpeed, ["maxSpeedMps"], null);

      if (typeof missingRatio === "number" && missingRatio > extremes.temporal.highestMissingRatio.value) {
        extremes.temporal.highestMissingRatio = { file: fileName, value: missingRatio };
      }
      if (typeof duplicateRatio === "number" && duplicateRatio > extremes.temporal.highestDuplicateRatio.value) {
        extremes.temporal.highestDuplicateRatio = { file: fileName, value: duplicateRatio };
      }
      if (typeof backtrackingCount === "number" && backtrackingCount > extremes.temporal.highestBacktrackingCount.value) {
        extremes.temporal.highestBacktrackingCount = { file: fileName, value: backtrackingCount };
      }
      if (typeof backtrackingMax === "number" && backtrackingMax > extremes.temporal.deepestBacktrackingMs.value) {
        extremes.temporal.deepestBacktrackingMs = { file: fileName, value: backtrackingMax };
      }
      if (typeof clusterSeq === "number" && clusterSeq > extremes.sampling.highestClusterCountSequential.value) {
        extremes.sampling.highestClusterCountSequential = { file: fileName, value: clusterSeq };
      }
      if (typeof maxRel === "number" && maxRel > extremes.sampling.highestGlobalMaxRelativeDeviation.value) {
        extremes.sampling.highestGlobalMaxRelativeDeviation = { file: fileName, value: maxRel };
      }
      if (typeof invalidTimeRatio === "number" && invalidTimeRatio > extremes.motion.highestInvalidTimeRatio.value) {
        extremes.motion.highestInvalidTimeRatio = { file: fileName, value: invalidTimeRatio };
      }
      if (typeof maxSpeed === "number" && maxSpeed > extremes.motion.highestMaxSpeedMps.value) {
        extremes.motion.highestMaxSpeedMps = { file: fileName, value: maxSpeed };
      }
    }
  }

  const analyzed = scope.analyzedGpxCount;

  const labels = {
    ingestion: {
      hasMultiplePointTypes: "Multiple point types in one file",
      hasNoTimestamps: "No timestamps at ingestion",
      hasRejectedPoints: "Rejected points present",
      hasWpt: "Contains wpt points",
      hasRtept: "Contains rtept points",
      hasTrkpt: "Contains trkpt points"
    },
    temporal: {
      anyTemporalAnomaly: "Any temporal anomaly",
      missingPresent: "Missing timestamps present",
      unparsablePresent: "Unparsable timestamps present",
      duplicatePresent: "Duplicate timestamps present",
      backtrackingPresent: "Backtracking timestamps present",
      missingBlockPresent: "Missing block(s) present",
      unparsableBlockPresent: "Unparsable block(s) present",
      duplicateBlockPresent: "Duplicate block(s) present",
      backtrackingBlockPresent: "Backtracking block(s) present",
      missingSinglePointPresent: "Missing single-point anomalies present",
      unparsableSinglePointPresent: "Unparsable single-point anomalies present",
      duplicateSinglePointPresent: "Duplicate single-point anomalies present",
      backtrackingSinglePointPresent: "Backtracking single-point anomalies present",
      noValidParsedTimestamps: "No valid parsed timestamps"
    },
    sampling: {
      hasValidTimestamps: "Has valid timestamps (sampling context)",
      hasTimeProgression: "Has positive time progression",
      noPositiveDeltas: "No positive deltas available",
      nonPositiveTimeDeltaRejections: "Non-positive time delta rejections present",
      clusterSortedGt1: "Cluster count sorted > 1",
      clusterSequentialGt1: "Cluster count sequential > 1",
      globalFinalMaxRelativeGt2Pct: "Global final max relative deviation > 2%",
      globalFinalMeanRelativeGt2Pct: "Global final mean relative deviation > 2%",
      samplingStabilityGt1: "Sampling stability ratio > 1",
      multiRegimeSignal: "Multi-regime sampling signal",
      distanceInvalidRejections: "Invalid distance rejections present"
    },
    motion: {
      anyMotionRejection: "Any motion rejection",
      missingTimestampPairs: "Missing timestamp pair rejections",
      unparsableTimestampPairs: "Unparsable timestamp pair rejections",
      nonFiniteDistancePairs: "Non-finite distance pair rejections",
      backwardPairs: "Backward-time pair rejections",
      zeroTimeDeltaPairs: "Zero-time-delta pair rejections",
      invalidTimeRatioGt0: "Invalid time ratio > 0",
      invalidTimeRatioGt0_10: "Invalid time ratio > 0.10",
      invalidTimeRatioGt0_25: "Invalid time ratio > 0.25",
      noValidMotionTime: "No valid motion time"
    }
  };

  const stats = {
    scope,
    presence: {
      ingestion: toPresenceRows(ingestionPresence, labels.ingestion, analyzed),
      temporal: toPresenceRows(temporalPresence, labels.temporal, analyzed),
      sampling: toPresenceRows(samplingPresence, labels.sampling, analyzed),
      motion: toPresenceRows(motionPresence, labels.motion, analyzed)
    },
    intensity: {
      ingestion: {
        totalPointCount: summarizeNumbers(numeric.ingestion.totalPointCount),
        validPointCount: summarizeNumbers(numeric.ingestion.validPointCount),
        rejectedPointCount: summarizeNumbers(numeric.ingestion.rejectedPointCount)
      },
      temporal: Object.fromEntries(Object.entries(numeric.temporal).map(([k, v]) => [k, summarizeNumbers(v)])),
      sampling: Object.fromEntries(Object.entries(numeric.sampling).map(([k, v]) => [k, summarizeNumbers(v)])),
      motion: Object.fromEntries(Object.entries(numeric.motion).map(([k, v]) => [k, summarizeNumbers(v)]))
    },
    consistency: {
      temporalCheckedEqualsIngestionValid: {
        count: consistency.temporalCheckedEqualsIngestionValid,
        percentage: pct(consistency.temporalCheckedEqualsIngestionValid, consistency.samples)
      },
      samplingTimestampedLeTemporalValid: {
        count: consistency.samplingTimestampedLeTemporalValid,
        percentage: pct(consistency.samplingTimestampedLeTemporalValid, consistency.samples)
      },
      motionForwardEqSamplingPositive: {
        count: consistency.motionForwardEqSamplingPositive,
        percentage: pct(consistency.motionForwardEqSamplingPositive, consistency.samples),
        diffSummary: summarizeNumbers(consistency.diffs.motionForwardMinusSamplingPositive)
      },
      samplingNonPositiveEqMotionBackwardPlusZero: {
        count: consistency.samplingNonPositiveEqMotionBackwardPlusZero,
        percentage: pct(consistency.samplingNonPositiveEqMotionBackwardPlusZero, consistency.samples),
        diffSummary: summarizeNumbers(consistency.diffs.samplingNonPositiveMinusMotionBackwardPlusZero)
      }
    },
    coOccurrence: {
      signalDefinitions: {
        T_missing: "Temporal missing present",
        T_unparsable: "Temporal unparsable present",
        T_duplicate: "Temporal duplicate present",
        T_backtracking: "Temporal backtracking present",
        S_multiRegime: "Sampling multi-regime signal",
        I_multiPointType: "Ingestion multiple point types",
        I_noTimestamps: "Ingestion no timestamps",
        M_nonFiniteDistance: "Motion non-finite distance present",
        S_invalidDistance: "Sampling invalid distance present"
      },
      signalPrevalence: coSignals.map((s) => ({
        signal: s,
        count: coSignalCounts[s],
        percentage: pct(coSignalCounts[s], analyzed)
      })).sort((a, b) => b.percentage - a.percentage),
      pairCounts: Object.keys(coPairCounts).sort().map((k) => ({
        pair: k,
        count: coPairCounts[k],
        percentage: pct(coPairCounts[k], analyzed)
      })),
      topSignatures: Object.keys(coSignatures).map((sig) => ({
        signature: sig,
        count: coSignatures[sig],
        percentage: pct(coSignatures[sig], analyzed)
      })).sort((a, b) => b.count - a.count).slice(0, 20)
    },
    extremes
  };

  ensureDir(reportDir);
  const jsonPath = path.join(reportDir, "statistics.json");
  fs.writeFileSync(jsonPath, JSON.stringify(stats, null, 2), "utf8");

  const md = [];
  md.push("# 12k GPX Study - Comprehensive Statistics");
  md.push("");
  md.push("## Scope");
  md.push("");
  md.push(`- Chunk prefix: \`${scope.chunkPrefix}\``);
  md.push(`- Chunk runs: ${scope.chunkRuns}`);
  md.push(`- Selected rows: ${scope.selectedCount}`);
  md.push(`- Processed rows: ${scope.processedCount}`);
  md.push(`- Passed: ${scope.passedCount}`);
  md.push(`- Failed: ${scope.failedCount}`);
  md.push(`- Skipped low points: ${scope.skippedLowPointsCount}`);
  md.push(`- Skipped duplicate id: ${scope.skippedDuplicateIdCount}`);
  md.push(`- Skipped duplicate content: ${scope.skippedDuplicateContentCount}`);
  md.push(`- Analyzed GPX JSON count: ${scope.analyzedGpxCount}`);
  md.push("");

  md.push("## Presence - Ingestion");
  md.push("");
  md.push(...renderPresenceTable(stats.presence.ingestion, analyzed));
  md.push("");

  md.push("## Presence - Temporal");
  md.push("");
  md.push(...renderPresenceTable(stats.presence.temporal, analyzed));
  md.push("");

  md.push("## Presence - Sampling");
  md.push("");
  md.push(...renderPresenceTable(stats.presence.sampling, analyzed));
  md.push("");

  md.push("## Presence - Motion");
  md.push("");
  md.push(...renderPresenceTable(stats.presence.motion, analyzed));
  md.push("");

  md.push("## Intensity Highlights");
  md.push("");
  md.push(renderSummaryLine("Ingestion totalPointCount", stats.intensity.ingestion.totalPointCount));
  md.push(renderSummaryLine("Temporal missingCount", stats.intensity.temporal.missingCount));
  md.push(renderSummaryLine("Temporal backtrackingCount", stats.intensity.temporal.backtrackingCount));
  md.push(renderSummaryLine("Temporal backtrackingMaxDepthMs", stats.intensity.temporal.backtrackingMaxDepthMs));
  md.push(renderSummaryLine("Sampling clusterCountSequential", stats.intensity.sampling.clusterCountSequential));
  md.push(renderSummaryLine("Sampling globalFinalMaxRelativeDeviation", stats.intensity.sampling.globalFinalMaxRelativeDeviation));
  md.push(renderSummaryLine("Motion invalidTimeRatio", stats.intensity.motion.invalidTimeRatio));
  md.push(renderSummaryLine("Motion maxSpeedMps", stats.intensity.motion.maxSpeedMps));
  md.push("");

  md.push("## Consistency Checks");
  md.push("");
  md.push(`- temporal.totalPointsChecked == ingestion.validPointCount: ${stats.consistency.temporalCheckedEqualsIngestionValid.count}/${scope.analyzedGpxCount} (${stats.consistency.temporalCheckedEqualsIngestionValid.percentage.toFixed(2)}%)`);
  md.push(`- sampling.timestampedPointsCount <= temporal.validParsedTimestampCount: ${stats.consistency.samplingTimestampedLeTemporalValid.count}/${scope.analyzedGpxCount} (${stats.consistency.samplingTimestampedLeTemporalValid.percentage.toFixed(2)}%)`);
  md.push(`- motion.forwardValidCount == sampling.positiveTimeDeltasCollected: ${stats.consistency.motionForwardEqSamplingPositive.count}/${scope.analyzedGpxCount} (${stats.consistency.motionForwardEqSamplingPositive.percentage.toFixed(2)}%)`);
  md.push(`- sampling.nonPositive == motion.backward + motion.zeroTimeDelta: ${stats.consistency.samplingNonPositiveEqMotionBackwardPlusZero.count}/${scope.analyzedGpxCount} (${stats.consistency.samplingNonPositiveEqMotionBackwardPlusZero.percentage.toFixed(2)}%)`);
  md.push("");

  md.push("## Co-occurrence (De-redundant Base Signals)");
  md.push("");
  md.push("| Signal | GPX Count | % of analyzed GPX |");
  md.push("|---|---:|---:|");
  for (const row of stats.coOccurrence.signalPrevalence) {
    md.push(`| ${row.signal} | ${row.count} | ${row.percentage.toFixed(2)}% |`);
  }
  md.push("");

  md.push("## Top Signatures");
  md.push("");
  md.push("| Signature | GPX Count | % of analyzed GPX |");
  md.push("|---|---:|---:|");
  for (const row of stats.coOccurrence.topSignatures) {
    md.push(`| ${row.signature} | ${row.count} | ${row.percentage.toFixed(2)}% |`);
  }
  md.push("");

  md.push("## Notes");
  md.push("");
  md.push("- Presence stats are track-level (binary per GPX).");
  md.push("- Intensity stats summarize raw metric distributions across analyzed GPX files.");
  md.push("- Co-occurrence excludes direct derivative aliases to reduce redundancy.");
  md.push("");

  const mdPath = path.join(reportDir, "STATISTICS-REPORT.md");
  fs.writeFileSync(mdPath, md.join("\n"), "utf8");

  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);
}

main();
