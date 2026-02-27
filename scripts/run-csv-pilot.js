const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { parse } = require("csv-parse");

const ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(ROOT, "datasets", "raw", "gpx-tracks-from-hikr.org.csv");

function parseCliArgs() {
  const args = process.argv.slice(2);
  let limit = 10;
  let runName = "csv-pilot-10";
  let minTotalPoints = 0;
  let offset = 0;
  let injectTestDuplicates = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--run-name" && args[i + 1]) {
      runName = args[i + 1];
      i++;
    } else if (arg === "--min-total-points" && args[i + 1]) {
      minTotalPoints = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--offset" && args[i + 1]) {
      offset = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--inject-test-duplicates") {
      injectTestDuplicates = true;
    }
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${limit}`);
  }
  if (!Number.isFinite(minTotalPoints) || minTotalPoints < 0) {
    throw new Error(`Invalid --min-total-points value: ${minTotalPoints}`);
  }
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error(`Invalid --offset value: ${offset}`);
  }

  return { limit, runName, minTotalPoints, offset, injectTestDuplicates };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeFilePart(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  const s = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return s.length > 0 ? s : fallback;
}

function normalizeGpxForHash(gpx) {
  if (!gpx || typeof gpx !== "string") return "";
  return gpx.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function sha1(text) {
  return crypto.createHash("sha1").update(text, "utf8").digest("hex");
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

function collectNonFinitePaths(node, basePath = "payload", out = []) {
  if (typeof node === "number") {
    if (!Number.isFinite(node)) out.push(basePath);
    return out;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      collectNonFinitePaths(node[i], `${basePath}[${i}]`, out);
    }
    return out;
  }
  if (node && typeof node === "object") {
    for (const key of Object.keys(node)) {
      collectNonFinitePaths(node[key], `${basePath}.${key}`, out);
    }
  }
  return out;
}

function getRatios(payload) {
  const temporalOrder = payload.audit && payload.audit.temporal && payload.audit.temporal.temporalOrder;
  const motionTime = payload.audit && payload.audit.motion && payload.audit.motion.time;
  return {
    missingRatio: temporalOrder && temporalOrder.missing ? temporalOrder.missing.ratio : null,
    unparsableRatio: temporalOrder && temporalOrder.unparsable ? temporalOrder.unparsable.ratio : null,
    duplicateRatio: temporalOrder && temporalOrder.duplicate ? temporalOrder.duplicate.ratio : null,
    invalidTimeRatio: motionTime ? motionTime.invalidTimeRatio : null
  };
}

function ratioIsValid(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function validatePayload(payload) {
  const findings = [];
  const ingestion = payload.audit && payload.audit.ingestion && payload.audit.ingestion.counts;
  if (
    ingestion &&
    ingestion.totalPointCount !== (ingestion.validPointCount + ingestion.rejectedPointCount)
  ) {
    findings.push("count_identity_failed");
  }

  const ratios = getRatios(payload);
  if (!ratioIsValid(ratios.missingRatio)) findings.push("missing_ratio_out_of_bounds");
  if (!ratioIsValid(ratios.unparsableRatio)) findings.push("unparsable_ratio_out_of_bounds");
  if (!ratioIsValid(ratios.duplicateRatio)) findings.push("duplicate_ratio_out_of_bounds");
  if (!ratioIsValid(ratios.invalidTimeRatio)) findings.push("invalid_time_ratio_out_of_bounds");

  const nonFinitePaths = collectNonFinitePaths(payload);
  if (nonFinitePaths.length > 0) findings.push(`non_finite_numbers:${nonFinitePaths.slice(0, 5).join(",")}`);

  return { passed: findings.length === 0, findings, ratios };
}

function createGpxRowParser(csvPath) {
  const stream = fs.createReadStream(csvPath);
  const parser = stream.pipe(parse({
    columns: true,
    bom: true,
    relax_quotes: true,
    skip_empty_lines: true
  }));
  return { stream, parser };
}

function writeSummary(results, summaryPath, limit, runName, minTotalPoints, offset, injectTestDuplicates) {
  const lines = [];
  const ok = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skippedLowPoints = results.filter((r) => r.status === "SKIPPED_LOW_POINTS").length;
  const skippedDuplicateId = results.filter((r) => r.status === "SKIPPED_DUPLICATE_ID").length;
  const skippedDuplicateContent = results.filter((r) => r.status === "SKIPPED_DUPLICATE_CONTENT").length;
  lines.push(`# ${runName} Summary`);
  lines.push("");
  lines.push(`- Source: \`datasets/raw/gpx-tracks-from-hikr.org.csv\``);
  lines.push(`- Limit: ${limit}`);
  lines.push(`- Offset (GPX rows skipped): ${offset}`);
  lines.push(`- Min total points filter: > ${minTotalPoints}`);
  lines.push(`- Injected duplicate test rows: ${injectTestDuplicates ? "yes" : "no"}`);
  lines.push(`- Processed: ${results.length}`);
  lines.push(`- Passed: ${ok}`);
  lines.push(`- Failed: ${failed}`);
  lines.push(`- Skipped (low points): ${skippedLowPoints}`);
  lines.push(`- Skipped (duplicate id): ${skippedDuplicateId}`);
  lines.push(`- Skipped (duplicate content): ${skippedDuplicateContent}`);
  lines.push("");
  lines.push("| # | rowNumber | id | totalPoints | status | output | findings |");
  lines.push("|---|-----------|----|-------------|--------|--------|----------|");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`| ${i + 1} | ${r.rowNumber} | ${r.id} | ${r.totalPointCount} | ${r.status} | ${r.outputFile || "-"} | ${r.findings.join("; ") || "-"} |`);
  }
  lines.push("");
  fs.writeFileSync(summaryPath, lines.join("\n"), "utf8");
}

async function main() {
  const { limit, runName, minTotalPoints, offset, injectTestDuplicates } = parseCliArgs();
  const runDir = path.join(ROOT, "runs", runName);
  const jsonDir = path.join(runDir, "json");
  const manifestPath = path.join(runDir, "manifest.json");
  const summaryPath = path.join(runDir, "summary.md");
  const errorsPath = path.join(runDir, "errors.jsonl");

  ensureDir(runDir);
  ensureDir(jsonDir);
  fs.writeFileSync(errorsPath, "", "utf8");
  loadBrowserModules();

  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }

  const { stream, parser } = createGpxRowParser(CSV_PATH);
  const results = [];
  const startedAt = new Date().toISOString();
  const seenIds = new Set();
  const seenGpxHashes = new Set();
  const seedRowsForInjection = [];
  let selectedCount = 0;
  let seenGpxRows = 0;
  let rowNumber = 1; // header is line 1

  function processSelectedRow(selectedRowNumber, selectedRow) {
    const id = sanitizeFilePart(String(selectedRow._id || ""), `row_${selectedRowNumber}`);
    const prefix = String(results.length + 1).padStart(4, "0");
    const outputFile = `${prefix}_${id}.audit.json`;
    const outputPath = path.join(jsonDir, outputFile);

    try {
      if (seenIds.has(id)) {
        results.push({
          rowNumber: selectedRowNumber,
          id,
          totalPointCount: null,
          status: "SKIPPED_DUPLICATE_ID",
          outputFile: null,
          findings: ["duplicate_id"]
        });
        return;
      }

      const gpxHash = sha1(normalizeGpxForHash(selectedRow.gpx));
      if (seenGpxHashes.has(gpxHash)) {
        results.push({
          rowNumber: selectedRowNumber,
          id,
          totalPointCount: null,
          status: "SKIPPED_DUPLICATE_CONTENT",
          outputFile: null,
          findings: ["duplicate_gpx_content"]
        });
        return;
      }

      seenIds.add(id);
      seenGpxHashes.add(gpxHash);

      const parsed = parseGPX(selectedRow.gpx);
      const totalPointCount = parsed &&
        parsed.audit &&
        parsed.audit.ingestion &&
        parsed.audit.ingestion.counts &&
        typeof parsed.audit.ingestion.counts.totalPointCount === "number"
        ? parsed.audit.ingestion.counts.totalPointCount
        : 0;

      if (totalPointCount <= minTotalPoints) {
        results.push({
          rowNumber: selectedRowNumber,
          id,
          totalPointCount,
          status: "SKIPPED_LOW_POINTS",
          outputFile: null,
          findings: [`totalPointCount<=${minTotalPoints}`]
        });
        return;
      }

      const points = parsed.points;
      const temporal = auditTimestamps(points);
      const sampling = auditSampling(points, id);
      const motion = auditMotion(points);

      const payload = buildAuditExportPayload({
        fileName: `${id}.gpx`,
        totalPointCount: parsed.audit.ingestion.counts.totalPointCount,
        ingestionAudit: parsed.audit.ingestion,
        temporalAudit: temporal.audit.temporal,
        samplingAudit: sampling.audit.sampling,
        motionAudit: motion.audit.motion
      });

      fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
      const check = validatePayload(payload);

      results.push({
        rowNumber: selectedRowNumber,
        id,
        totalPointCount,
        status: check.passed ? "PASS" : "FAIL",
        outputFile,
        findings: check.findings
      });
    } catch (error) {
      fs.appendFileSync(errorsPath, JSON.stringify({
        rowNumber: selectedRowNumber,
        id,
        error: error && error.message ? error.message : String(error)
      }) + "\n");
      results.push({
        rowNumber: selectedRowNumber,
        id,
        totalPointCount: null,
        status: "FAIL",
        outputFile: null,
        findings: ["exception_during_processing"]
      });
    }
  }

  for await (const row of parser) {
    rowNumber++;
    if (!row || typeof row.gpx !== "string" || !row.gpx.includes("<gpx")) {
      continue;
    }

    seenGpxRows++;
    if (seenGpxRows <= offset) {
      continue;
    }

    selectedCount++;
    if (injectTestDuplicates && seedRowsForInjection.length < 3) {
      seedRowsForInjection.push({ rowNumber, row });
    }

    processSelectedRow(rowNumber, row);

    if (selectedCount >= limit) {
      break;
    }
  }
  stream.destroy();

  if (injectTestDuplicates && seedRowsForInjection.length >= 3) {
    const first = seedRowsForInjection[0];
    const second = seedRowsForInjection[1];
    const third = seedRowsForInjection[2];

    const duplicateIdRow = {
      ...second.row,
      _id: first.row._id
    };
    const duplicateContentRow = {
      ...third.row,
      _id: `${third.row._id || "row"}_dup_content`,
      gpx: first.row.gpx
    };

    processSelectedRow(second.rowNumber, duplicateIdRow);
    processSelectedRow(third.rowNumber, duplicateContentRow);
  }

  const finishedAt = new Date().toISOString();
  const manifest = {
    sourceCsv: "datasets/raw/gpx-tracks-from-hikr.org.csv",
    limit: limit,
    offset,
    selectedCount,
    startedAt,
    finishedAt,
    processedCount: results.length,
    passedCount: results.filter((r) => r.status === "PASS").length,
    failedCount: results.filter((r) => r.status === "FAIL").length,
    skippedLowPointsCount: results.filter((r) => r.status === "SKIPPED_LOW_POINTS").length,
    skippedDuplicateIdCount: results.filter((r) => r.status === "SKIPPED_DUPLICATE_ID").length,
    skippedDuplicateContentCount: results.filter((r) => r.status === "SKIPPED_DUPLICATE_CONTENT").length,
    injectTestDuplicates,
    minTotalPointsFilter: minTotalPoints,
    outputDir: `runs/${runName}/json`,
    results
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  writeSummary(results, summaryPath, limit, runName, minTotalPoints, offset, injectTestDuplicates);

  console.log(`Processed ${results.length} GPX rows from CSV`);
  console.log(`Passed: ${manifest.passedCount}, Failed: ${manifest.failedCount}`);
  console.log(`Skipped -> low points: ${manifest.skippedLowPointsCount}, duplicate id: ${manifest.skippedDuplicateIdCount}, duplicate content: ${manifest.skippedDuplicateContentCount}`);
  console.log(`JSON output: ${jsonDir}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Summary: ${summaryPath}`);
  if (manifest.failedCount > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
