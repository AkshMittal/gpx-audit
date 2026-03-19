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

function inferTrackUid(auditFileName, payload) {
  const fileMatch = auditFileName.match(/^\d+_([^.]+)\.audit\.json$/i);
  if (fileMatch) return fileMatch[1];
  const sourceFileName = payload?.metadata?.source?.fileName;
  if (typeof sourceFileName === "string" && sourceFileName.length > 0) {
    return sourceFileName.replace(/\.gpx$/i, "");
  }
  throw new Error("Could not infer track_uid from file name or payload metadata.");
}

async function findGpxByTrackUid(csvPath, trackUid) {
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);
  const stream = fs.createReadStream(csvPath);
  const parser = stream.pipe(parse({
    columns: true,
    bom: true,
    relax_quotes: true,
    skip_empty_lines: true
  }));

  try {
    for await (const row of parser) {
      if (!row || typeof row._id !== "string") continue;
      if (row._id === trackUid) {
        stream.destroy();
        if (typeof row.gpx !== "string" || !row.gpx.includes("<gpx")) {
          throw new Error(`Row for ${trackUid} does not contain valid GPX string.`);
        }
        return row.gpx;
      }
    }
  } finally {
    stream.destroy();
  }

  throw new Error(`track_uid ${trackUid} not found in CSV.`);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  parseDotEnv(path.join(ROOT, ".env"));

  const auditFileArg = args["audit-file"];
  if (!auditFileArg) {
    throw new Error("Usage: --audit-file <path-to-audit-json> [--csv <path>] [--dry-run]");
  }

  const auditFilePath = path.resolve(process.cwd(), auditFileArg);
  if (!fs.existsSync(auditFilePath)) {
    throw new Error(`Audit file not found: ${auditFilePath}`);
  }

  const csvPath = args.csv ? path.resolve(process.cwd(), args.csv) : DEFAULT_CSV_PATH;
  const isDryRun = Boolean(args["dry-run"]);
  const auditBucket = args["audit-bucket"] || "audit-details";
  const rawBucket = args["raw-bucket"] || "raw-gpx";

  const auditRaw = fs.readFileSync(auditFilePath, "utf8");
  const auditPayload = JSON.parse(auditRaw);
  const auditFileName = path.basename(auditFilePath);
  const trackUid = inferTrackUid(auditFileName, auditPayload);

  const gpxRaw = await findGpxByTrackUid(csvPath, trackUid);
  const auditHash = sha256(JSON.stringify(auditPayload));
  const gpxHash = sha256(gpxRaw);

  const auditObjectPath = `tracks/${trackUid}/audit.v1.json`;
  const gpxObjectPath = `tracks/${trackUid}/source.gpx`;

  console.log(`track_uid=${trackUid}`);
  console.log(`audit_object=${auditBucket}/${auditObjectPath}`);
  console.log(`raw_object=${rawBucket}/${gpxObjectPath}`);
  console.log(`audit_hash=${auditHash}`);
  console.log(`raw_hash=${gpxHash}`);

  if (isDryRun) {
    console.log("DRY_RUN=true (no upload/update performed)");
    return;
  }

  const { url, serviceRole } = assertEnv();
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  const { error: auditUploadError } = await supabase.storage
    .from(auditBucket)
    .upload(auditObjectPath, Buffer.from(auditRaw, "utf8"), {
      contentType: "application/json",
      upsert: true
    });
  if (auditUploadError) {
    throw new Error(`Audit upload failed: ${auditUploadError.message}`);
  }

  const { error: gpxUploadError } = await supabase.storage
    .from(rawBucket)
    .upload(gpxObjectPath, Buffer.from(gpxRaw, "utf8"), {
      contentType: "application/gpx+xml",
      upsert: true
    });
  if (gpxUploadError) {
    throw new Error(`Raw GPX upload failed: ${gpxUploadError.message}`);
  }

  const { data: updatedTrack, error: updateError } = await supabase
    .from("tracks")
    .update({
      audit_detail_path: auditObjectPath,
      raw_gpx_path: gpxObjectPath,
      audit_detail_hash: auditHash,
      raw_gpx_hash: gpxHash
    })
    .eq("track_uid", trackUid)
    .select("id, track_uid, audit_detail_path, raw_gpx_path")
    .single();

  if (updateError) {
    throw new Error(`Track update failed: ${updateError.message}`);
  }

  console.log(
    `UPLOAD_OK track_id=${updatedTrack.id} track_uid=${updatedTrack.track_uid} audit_path=${updatedTrack.audit_detail_path} raw_path=${updatedTrack.raw_gpx_path}`
  );
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
