#!/usr/bin/env node
/**
 * Upload only audit JSON files to Supabase Storage (audit-details bucket).
 * Does not touch raw GPX or the raw-gpx bucket.
 *
 * Usage:
 *   node scripts/upload-audit-json-to-storage.js --dir <audit-json-dir> [--limit N] [--offset N] [--dry-run] [--skip-db-update]
 *   node scripts/upload-audit-json-to-storage.js --audit-file <path> [--dry-run] [--skip-db-update]
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env at repo root)
 *
 * Default audit bucket: audit-details
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  parseDotEnv(path.join(ROOT, ".env"));

  const auditFileArg = args["audit-file"] ? path.resolve(process.cwd(), args["audit-file"]) : null;
  const auditDirArg = args.dir ? path.resolve(process.cwd(), args.dir) : null;
  if (!auditFileArg && !auditDirArg) {
    throw new Error(
      "Usage: --audit-file <path> OR --dir <audit-json-dir> [--limit N] [--offset N] [--dry-run] [--skip-db-update] [--audit-bucket NAME]"
    );
  }
  if (auditFileArg && auditDirArg) throw new Error("Use only one of --audit-file or --dir");

  const limit = args.limit ? Math.max(0, Number(args.limit)) : null;
  const offset = args.offset ? Math.max(0, Number(args.offset)) : 0;

  const isDryRun = Boolean(args["dry-run"]);
  const skipDbUpdate = Boolean(args["skip-db-update"]);
  const auditBucket = args["audit-bucket"] || "audit-details";

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

  let supabase = null;
  if (!isDryRun) {
    const { url, serviceRole } = assertEnv();
    supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  }

  let success = 0;
  let failed = 0;

  for (const auditFilePath of selected) {
    let trackUid = "";
    try {
      const auditRaw = fs.readFileSync(auditFilePath, "utf8");
      const payload = JSON.parse(auditRaw);
      trackUid = inferTrackUidFromAuditPath(auditFilePath, payload);

      const auditHash = sha256(auditRaw);
      const auditObjPath = auditObjectPath(trackUid, payload);

      if (isDryRun) {
        console.log(`DRY_RUN track_uid=${trackUid} audit_object=${auditBucket}/${auditObjPath}`);
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

      if (skipDbUpdate) {
        console.log(
          `UPLOAD_OK track_uid=${trackUid} audit_path=${auditObjPath} (skip-db-update; tracks table unchanged)`
        );
        success += 1;
        continue;
      }

      const { data: updatedTrack, error: updateError } = await supabase
        .from("tracks")
        .update({
          audit_detail_path: auditObjPath,
          audit_detail_hash: auditHash,
        })
        .eq("track_uid", trackUid)
        .select("id, track_uid, audit_detail_path")
        .maybeSingle();

      if (updateError) throw new Error(`Track update failed: ${updateError.message}`);
      if (!updatedTrack) {
        throw new Error(`No tracks row for track_uid=${trackUid} (storage upload succeeded)`);
      }

      console.log(
        `UPLOAD_OK track_id=${updatedTrack.id} track_uid=${updatedTrack.track_uid} audit_path=${updatedTrack.audit_detail_path}`
      );
      success += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `UPLOAD_FAIL file=${path.basename(auditFilePath)} track_uid=${trackUid || "?"} reason=${error.message || String(error)}`
      );
    }
  }

  console.log(
    `DONE selected=${selected.length} success=${success} failed=${failed} dryRun=${isDryRun} skipDbUpdate=${skipDbUpdate}`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
