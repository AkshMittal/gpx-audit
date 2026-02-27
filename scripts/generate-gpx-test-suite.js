const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const TEST_GPX_DIR = path.join(ROOT, "test-gpx");
const JSON_DIR = path.resolve(ROOT, "..", "json");
const SANITY_REPORT_PATH = path.join(ROOT, "test-gpx", "SANITY-CHECK.md");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isoAt(baseIso, plusSec) {
  const ms = Date.parse(baseIso) + plusSec * 1000;
  return new Date(ms).toISOString();
}

function asCoord(value) {
  return Number(value.toFixed(6));
}

function buildLinearTrack(config) {
  const {
    count,
    startLat,
    startLon,
    latStep,
    lonStep,
    baseIso,
    dtSec,
    anomalyMutator
  } = config;
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      lat: asCoord(startLat + i * latStep),
      lon: asCoord(startLon + i * lonStep),
      time: isoAt(baseIso, i * dtSec)
    });
  }
  if (typeof anomalyMutator === "function") {
    anomalyMutator(points);
  }
  return points;
}

function trkptXml(point) {
  const lat = point.rawLat !== undefined ? point.rawLat : point.lat;
  const lon = point.rawLon !== undefined ? point.rawLon : point.lon;
  const ele = point.ele !== undefined ? point.ele : 100;
  const hasTime = Object.prototype.hasOwnProperty.call(point, "time");
  const timeLine = hasTime && point.time !== null ? `<time>${point.time}</time>` : "";
  return `      <trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele>${timeLine}</trkpt>`;
}

function toGpxXml(points, trackName) {
  const trkpts = points.map(trkptXml).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="gpx-audit-test-suite" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${trackName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

function loadBrowserModules() {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.Blob = dom.window.Blob;
  global.URL = dom.window.URL;

  const moduleFiles = [
    path.join(ROOT, "js", "gpx-ingestion-module.js"),
    path.join(ROOT, "js", "timestamp-audit.js"),
    path.join(ROOT, "js", "sampling-audit.js"),
    path.join(ROOT, "js", "motion-audit.js"),
    path.join(ROOT, "js", "audit-export-module.js")
  ];

  for (const filePath of moduleFiles) {
    const code = fs.readFileSync(filePath, "utf8");
    vm.runInThisContext(code, { filename: filePath });
  }
}

function approxEqual(a, b, epsilon = 1e-9) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= epsilon;
}

function validatePayload(payload, fileName) {
  const mismatches = [];
  const ingestion = payload.audit.ingestion;
  const temporal = payload.audit.temporal;
  const sampling = payload.audit.sampling;
  const motion = payload.audit.motion;

  if (
    ingestion &&
    ingestion.counts &&
    ingestion.counts.totalPointCount !==
      ingestion.counts.validPointCount + ingestion.counts.rejectedPointCount
  ) {
    mismatches.push(`${fileName}: ingestion count identity failed`);
  }

  if (temporal && typeof temporal.totalPointsChecked === "number" && temporal.temporalOrder) {
    const total = temporal.totalPointsChecked;
    const missing = temporal.temporalOrder.missing;
    const unparsable = temporal.temporalOrder.unparsable;
    const duplicate = temporal.temporalOrder.duplicate;
    if (missing && !approxEqual(missing.ratio, total > 0 ? missing.count / total : 0)) {
      mismatches.push(`${fileName}: missing ratio mismatch`);
    }
    if (unparsable && !approxEqual(unparsable.ratio, total > 0 ? unparsable.count / total : 0)) {
      mismatches.push(`${fileName}: unparsable ratio mismatch`);
    }
    if (duplicate && !approxEqual(duplicate.ratio, total > 0 ? duplicate.count / total : 0)) {
      mismatches.push(`${fileName}: duplicate ratio mismatch`);
    }
  }

  if (sampling && sampling.time) {
    const deltaCount = sampling.time.deltaStatistics ? sampling.time.deltaStatistics.count : 0;
    const positive = sampling.time.timestampContext
      ? sampling.time.timestampContext.positiveTimeDeltasCollected
      : 0;
    if (deltaCount !== positive) {
      mismatches.push(`${fileName}: sampling delta count mismatch`);
    }
    if (sampling.time.clustering && sampling.time.normalization) {
      const clusterTotal = sampling.time.clustering.totalDeltas;
      if (clusterTotal !== deltaCount) {
        mismatches.push(`${fileName}: clustering total delta mismatch`);
      }
    }
  }

  if (motion && motion.time && motion.distance && motion.speed) {
    const valid = motion.time.validMotionTimeSeconds;
    const invalid = motion.time.invalidTimeSeconds;
    const expectedRatio = valid + invalid > 0 ? invalid / (valid + invalid) : 0;
    if (!approxEqual(expectedRatio, motion.time.invalidTimeRatio)) {
      mismatches.push(`${fileName}: motion invalidTimeRatio mismatch`);
    }
    if (motion.speed.meanSpeedMps !== null) {
      const expectedMean = valid > 0 ? motion.distance.totalValidDistanceMeters / valid : null;
      if (!approxEqual(expectedMean, motion.speed.meanSpeedMps)) {
        mismatches.push(`${fileName}: motion mean speed mismatch`);
      }
    }
    if (
      motion.speed.medianSpeedMps !== null &&
      motion.speed.maxSpeedMps !== null &&
      motion.speed.medianSpeedMps > motion.speed.maxSpeedMps
    ) {
      mismatches.push(`${fileName}: motion median > max`);
    }
  }

  return mismatches;
}

function summarizeForExpected(payload) {
  const ingestion = payload.audit.ingestion || {};
  const temporal = payload.audit.temporal || {};
  const sampling = payload.audit.sampling || {};
  const motion = payload.audit.motion || {};

  return {
    totalPoints: ingestion.counts ? ingestion.counts.totalPointCount : null,
    rejectedCoords: ingestion.rejections ? ingestion.rejections.count : null,
    missingTs: temporal.temporalOrder && temporal.temporalOrder.missing ? temporal.temporalOrder.missing.count : null,
    unparsableTs: temporal.temporalOrder && temporal.temporalOrder.unparsable ? temporal.temporalOrder.unparsable.count : null,
    duplicateTs: temporal.temporalOrder && temporal.temporalOrder.duplicate ? temporal.temporalOrder.duplicate.count : null,
    backtracking: temporal.temporalOrder && temporal.temporalOrder.backtracking ? temporal.temporalOrder.backtracking.count : null,
    positiveDeltas: sampling.time && sampling.time.deltaStatistics ? sampling.time.deltaStatistics.count : null,
    clusterCountSorted: sampling.time && sampling.time.clustering ? sampling.time.clustering.clusterCountSorted : null,
    motionForwardValid: motion.pairCounts ? motion.pairCounts.forwardValidCount : null,
    motionInvalidTimeRatio: motion.time ? motion.time.invalidTimeRatio : null
  };
}

function buildSuites() {
  const baseIso = "2026-02-14T00:00:00.000Z";
  return [
    {
      fileName: "01-clean-steady-1hz.gpx",
      description: "Baseline clean track: uniform 1-second sampling, no anomalies.",
      points: buildLinearTrack({
        count: 12,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0.0001,
        lonStep: 0.0001,
        baseIso,
        dtSec: 1
      })
    },
    {
      fileName: "02-clean-steady-5s.gpx",
      description: "Clean track: uniform 5-second sampling.",
      points: buildLinearTrack({
        count: 12,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0.00012,
        lonStep: 0.00008,
        baseIso,
        dtSec: 5
      })
    },
    {
      fileName: "03-duplicate-timestamp-block.gpx",
      description: "Has a contiguous duplicate timestamp block.",
      points: buildLinearTrack({
        count: 12,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0.00009,
        lonStep: 0.00007,
        baseIso,
        dtSec: 2,
        anomalyMutator: (pts) => {
          pts[5].time = pts[4].time;
          pts[6].time = pts[4].time;
        }
      })
    },
    {
      fileName: "04-missing-timestamp-block.gpx",
      description: "Contains contiguous missing timestamp block.",
      points: buildLinearTrack({
        count: 12,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0.00008,
        lonStep: 0.00008,
        baseIso,
        dtSec: 3,
        anomalyMutator: (pts) => {
          pts[3].time = null;
          pts[4].time = null;
          pts[5].time = null;
        }
      })
    },
    {
      fileName: "05-unparsable-timestamp-block.gpx",
      description: "Contains contiguous unparsable timestamps.",
      points: buildLinearTrack({
        count: 12,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0.00011,
        lonStep: 0.00005,
        baseIso,
        dtSec: 3,
        anomalyMutator: (pts) => {
          pts[6].time = "INVALID_TIMESTAMP_ALPHA";
          pts[7].time = "INVALID_TIMESTAMP_BETA";
        }
      })
    },
    {
      fileName: "06-backtracking-block.gpx",
      description: "Contains timestamp backtracking block under anchor logic.",
      points: buildLinearTrack({
        count: 12,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0.0001,
        lonStep: 0.00006,
        baseIso,
        dtSec: 4,
        anomalyMutator: (pts) => {
          pts[6].time = isoAt(baseIso, 12);
          pts[7].time = isoAt(baseIso, 16);
        }
      })
    },
    {
      fileName: "07-zero-time-delta-pairs.gpx",
      description: "Repeated timestamps create zero-time-delta pair rejections.",
      points: buildLinearTrack({
        count: 12,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0.00006,
        lonStep: 0.00006,
        baseIso,
        dtSec: 2,
        anomalyMutator: (pts) => {
          pts[2].time = pts[1].time;
          pts[8].time = pts[7].time;
        }
      })
    },
    {
      fileName: "08-mixed-anomalies.gpx",
      description: "Mixed issues: missing, unparsable, duplicate, and backtracking.",
      points: buildLinearTrack({
        count: 14,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0.0001,
        lonStep: 0.00004,
        baseIso,
        dtSec: 3,
        anomalyMutator: (pts) => {
          pts[2].time = null;
          pts[3].time = null;
          pts[5].time = "BROKEN";
          pts[7].time = pts[6].time;
          pts[10].time = isoAt(baseIso, 9);
        }
      })
    },
    {
      fileName: "09-static-geometry-valid-time.gpx",
      description: "Valid increasing time with zero movement (distance near 0).",
      points: buildLinearTrack({
        count: 10,
        startLat: 12.9716,
        startLon: 77.5946,
        latStep: 0,
        lonStep: 0,
        baseIso,
        dtSec: 1
      })
    },
    {
      fileName: "10-invalid-coordinates-ingestion.gpx",
      description: "Includes invalid coordinates to trigger ingestion rejections.",
      points: (() => {
        const pts = buildLinearTrack({
          count: 10,
          startLat: 12.9716,
          startLon: 77.5946,
          latStep: 0.0001,
          lonStep: 0.0001,
          baseIso,
          dtSec: 2
        });
        pts[3] = { rawLat: "abc", rawLon: "77.5950", time: isoAt(baseIso, 6) };
        pts[7] = { rawLat: "95.0000", rawLon: "190.0000", time: isoAt(baseIso, 14) };
        return pts;
      })()
    },
    {
      fileName: "11-multi-regime-sampling.gpx",
      description: "Two dominant regimes (1s and 5s) for clustering behavior.",
      points: (() => {
        const pts = buildLinearTrack({
          count: 14,
          startLat: 12.9716,
          startLon: 77.5946,
          latStep: 0.0001,
          lonStep: 0.00009,
          baseIso,
          dtSec: 1
        });
        for (let i = 7; i < pts.length; i++) {
          pts[i].time = isoAt(baseIso, 6 + (i - 6) * 5);
        }
        return pts;
      })()
    },
    {
      fileName: "12-no-valid-timestamps.gpx",
      description: "No parseable timestamps: missing and unparsable only.",
      points: (() => {
        const pts = buildLinearTrack({
          count: 10,
          startLat: 12.9716,
          startLon: 77.5946,
          latStep: 0.00008,
          lonStep: 0.00003,
          baseIso,
          dtSec: 2
        });
        for (let i = 0; i < pts.length; i++) {
          pts[i].time = i % 2 === 0 ? null : `INVALID_TIMESTAMP_${i}`;
        }
        return pts;
      })()
    }
  ];
}

function main() {
  ensureDir(TEST_GPX_DIR);
  ensureDir(JSON_DIR);
  loadBrowserModules();

  const suites = buildSuites();
  const expectedLines = [];
  const allMismatches = [];

  expectedLines.push("# GPX Test Suite Expected Signatures");
  expectedLines.push("");
  expectedLines.push("Generated by `scripts/generate-gpx-test-suite.js`.");
  expectedLines.push("");

  for (const suite of suites) {
    const xml = toGpxXml(suite.points, suite.fileName.replace(".gpx", ""));
    const gpxPath = path.join(TEST_GPX_DIR, suite.fileName);
    fs.writeFileSync(gpxPath, xml, "utf8");

    const parsed = parseGPX(xml);
    const points = parsed.points;
    const temporalResult = auditTimestamps(points);
    const samplingResult = auditSampling(points, suite.fileName.replace(".gpx", ""));
    const motionResult = auditMotion(points);

    const payload = buildAuditExportPayload({
      fileName: suite.fileName,
      totalPointCount: parsed.audit.ingestion.counts.totalPointCount,
      ingestionAudit: parsed.audit.ingestion,
      temporalAudit: temporalResult.audit.temporal,
      samplingAudit: samplingResult.audit.sampling,
      motionAudit: motionResult.audit.motion
    });

    const jsonFileName = suite.fileName.replace(".gpx", ".audit.json");
    const jsonPath = path.join(JSON_DIR, jsonFileName);
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

    const mismatches = validatePayload(payload, suite.fileName);
    allMismatches.push(...mismatches);

    const summary = summarizeForExpected(payload);
    expectedLines.push(`## ${suite.fileName}`);
    expectedLines.push(`- Scenario: ${suite.description}`);
    expectedLines.push(`- totalPoints: ${summary.totalPoints}, rejectedCoords: ${summary.rejectedCoords}`);
    expectedLines.push(`- missingTs: ${summary.missingTs}, unparsableTs: ${summary.unparsableTs}, duplicateTs: ${summary.duplicateTs}, backtracking: ${summary.backtracking}`);
    expectedLines.push(`- positiveDeltas: ${summary.positiveDeltas}, clusterCountSorted: ${summary.clusterCountSorted}`);
    expectedLines.push(`- motionForwardValid: ${summary.motionForwardValid}, motionInvalidTimeRatio: ${summary.motionInvalidTimeRatio}`);
    expectedLines.push("");
  }

  fs.writeFileSync(path.join(TEST_GPX_DIR, "EXPECTED.md"), expectedLines.join("\n"), "utf8");

  const sanityLines = [];
  sanityLines.push("# Sanity Check Report");
  sanityLines.push("");
  if (allMismatches.length === 0) {
    sanityLines.push("- No derivable-metric mismatches found across generated payloads.");
  } else {
    sanityLines.push("- Mismatches detected:");
    for (const mismatch of allMismatches) {
      sanityLines.push(`  - ${mismatch}`);
    }
  }
  sanityLines.push("");
  fs.writeFileSync(SANITY_REPORT_PATH, sanityLines.join("\n"), "utf8");

  console.log(`Generated ${suites.length} GPX files in: ${TEST_GPX_DIR}`);
  console.log(`Generated audit JSON files in: ${JSON_DIR}`);
  console.log(`Expected signatures: ${path.join(TEST_GPX_DIR, "EXPECTED.md")}`);
  console.log(`Sanity report: ${SANITY_REPORT_PATH}`);
  if (allMismatches.length > 0) {
    process.exitCode = 2;
  }
}

main();
