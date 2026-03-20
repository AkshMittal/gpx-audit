#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parse } = require("csv-parse");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CSV_PATH = path.join(ROOT, "datasets", "raw", "gpx-tracks-from-hikr.org.csv");

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

function assertEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL in .env");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
  return { url, serviceRole };
}

function inferTrackUidFromAuditPath(auditFilePath, payload) {
  const auditFileName = path.basename(auditFilePath);
  const fileMatch = auditFileName.match(/^\d+_([^.]+)\.audit(?:\.v2)?\.json$/i);
  if (fileMatch) return fileMatch[1];
  const uidOnlyMatch = auditFileName.match(/^([^.]+)\.audit(?:\.v2)?\.json$/i);
  if (uidOnlyMatch) return uidOnlyMatch[1];
  const sourceFileName = payload?.metadata?.source?.fileName;
  if (typeof sourceFileName === "string" && sourceFileName.length > 0) {
    return sourceFileName.replace(/\.gpx$/i, "");
  }
  throw new Error("Could not infer track_uid from file name or payload metadata.");
}

function listAuditFilesInDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".audit.json") || entry.name.endsWith(".audit.v2.json"))
    )
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function auditObjectPath(trackUid, payload) {
  const schemaVersion = payload?.metadata?.schemaVersion || "2.0.0";
  const major = String(schemaVersion).split(".")[0] || "2";
  const versionToken = major.startsWith("v") ? major : `v${major}`;
  return `${trackUid}.audit.${versionToken}.json`;
}

function gpxObjectPath(trackUid) {
  return `${trackUid}.gpx`;
}

async function buildTrackUidToGpxMap(csvPath, targetTrackUids) {
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);

  const remaining = new Set(targetTrackUids);
  const found = new Map();
  if (remaining.size === 0) return found;

  const stream = fs.createReadStream(csvPath);
  const parser = stream.pipe(
    parse({
      columns: true,
      bom: true,
      relax_quotes: true,
      skip_empty_lines: true,
    })
  );

  try {
    for await (const row of parser) {
      if (remaining.size === 0) break;
      if (!row || typeof row._id !== "string") continue;
      if (!remaining.has(row._id)) continue;
      if (typeof row.gpx !== "string" || !row.gpx.includes("<gpx")) {
        throw new Error(`Row for ${row._id} does not contain valid GPX string.`);
      }
      found.set(row._id, row.gpx);
      remaining.delete(row._id);
    }
  } finally {
    stream.destroy();
  }

  return found;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  parseDotEnv(path.join(ROOT, ".env"));

  const auditFileArg = args["audit-file"] ? path.resolve(process.cwd(), args["audit-file"]) : null;
  const auditDirArg = args.dir ? path.resolve(process.cwd(), args.dir) : null;
  if (!auditFileArg && !auditDirArg) {
    throw new Error(
      "Usage: --audit-file <path> OR --dir <audit-json-dir> [--csv <path>] [--limit N] [--offset N] [--dry-run]"
    );
  }
  if (auditFileArg && auditDirArg) throw new Error("Use only one of --audit-file or --dir");

  const limit = args.limit ? Math.max(0, Number(args.limit)) : null;
  const offset = args.offset ? Math.max(0, Number(args.offset)) : 0;

  const csvPath = args.csv ? path.resolve(process.cwd(), args.csv) : DEFAULT_CSV_PATH;
  const isDryRun = Boolean(args["dry-run"]);
  const auditBucket = args["audit-bucket"] || "audit-details";
  const rawBucket = args["raw-bucket"] || "raw-gpx";

  let auditFiles = [];
  if (auditFileArg) {
    if (!fs.existsSync(auditFileArg)) throw new Error(`Audit file not found: ${auditFileArg}`);
    auditFiles = [auditFileArg];
  } else {
    auditFiles = listAuditFilesInDir(auditDirArg);
  }
  const selected = auditFiles.slice(offset, limit === null ? undefined : offset + limit);
  if (selected.length === 0) {
    console.log("No files selected.");
    return;
  }

  const parsedAudit = [];
  const targetUids = [];
  for (const auditFilePath of selected) {
    const auditRaw = fs.readFileSync(auditFilePath, "utf8");
    const payload = JSON.parse(auditRaw);
    const trackUid = inferTrackUidFromAuditPath(auditFilePath, payload);
    parsedAudit.push({ auditFilePath, auditRaw, payload, trackUid });
    targetUids.push(trackUid);
  }

  const uidToGpx = await buildTrackUidToGpxMap(csvPath, targetUids);

  let supabase = null;
  if (!isDryRun) {
    const { url, serviceRole } = assertEnv();
    supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  }

  let success = 0;
  let failed = 0;

  for (const item of parsedAudit) {
    const { payload, auditRaw, trackUid, auditFilePath } = item;
    try {
      const gpxRaw = uidToGpx.get(trackUid);
      if (!gpxRaw) throw new Error(`track_uid ${trackUid} not found in CSV`);

      const auditHash = sha256(auditRaw);
      const gpxHash = sha256(gpxRaw);
      const auditObjPath = auditObjectPath(trackUid, payload);
      const rawObjPath = gpxObjectPath(trackUid);

      if (isDryRun) {
        console.log(
          `DRY_RUN track_uid=${trackUid} audit_object=${auditBucket}/${auditObjPath} raw_object=${rawBucket}/${rawObjPath}`
        );
        success += 1;
        continue;
      }

      const { error: auditUploadError } = await supabase.storage
        .from(auditBucket)
        .upload(auditObjPath, Buffer.from(auditRaw, "utf8"), {
          contentType: "application/json",
          upsert: true,
        });
      if (auditUploadError) throw new Error(`Audit upload failed: ${auditUploadError.message}`);

      const { error: gpxUploadError } = await supabase.storage
        .from(rawBucket)
        .upload(rawObjPath, Buffer.from(gpxRaw, "utf8"), {
          contentType: "application/gpx+xml",
          upsert: true,
        });
      if (gpxUploadError) throw new Error(`Raw GPX upload failed: ${gpxUploadError.message}`);

      const { data: updatedTrack, error: updateError } = await supabase
        .from("tracks")
        .update({
          audit_detail_path: auditObjPath,
          raw_gpx_path: rawObjPath,
          audit_detail_hash: auditHash,
          raw_gpx_hash: gpxHash,
        })
        .eq("track_uid", trackUid)
        .select("id, track_uid, audit_detail_path, raw_gpx_path")
        .single();
      if (updateError) throw new Error(`Track update failed: ${updateError.message}`);

      console.log(
        `UPLOAD_OK track_id=${updatedTrack.id} track_uid=${updatedTrack.track_uid} audit_path=${updatedTrack.audit_detail_path} raw_path=${updatedTrack.raw_gpx_path}`
      );
      success += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `UPLOAD_FAIL file=${path.basename(auditFilePath)} track_uid=${trackUid} reason=${error.message || String(error)}`
      );
    }
  }

  console.log(`DONE selected=${selected.length} success=${success} failed=${failed} dryRun=${isDryRun}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
