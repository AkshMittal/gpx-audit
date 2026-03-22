#!/usr/bin/env node
/**
 * Upload adversarial custom-test GPX + audit JSON from fixtures/ to Storage
 * and update tracks (raw_gpx_*, audit_detail_*).
 *
 * Usage: node scripts/upload-custom-test-fixtures-to-storage.js [--dry-run]
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(ROOT, "fixtures", "adversarial-custom-test");
const GPX_DIR = path.join(FIXTURES, "gpx");
const JSON_DIR = path.join(FIXTURES, "json");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  parseDotEnv(path.join(ROOT, ".env"));
  const isDryRun = Boolean(args["dry-run"]);
  const auditBucket = args["audit-bucket"] || "audit-details";
  const rawBucket = args["raw-bucket"] || "raw-gpx";

  if (!fs.existsSync(GPX_DIR)) throw new Error(`Missing ${GPX_DIR}`);
  if (!fs.existsSync(JSON_DIR)) throw new Error(`Missing ${JSON_DIR}`);

  const gpxFiles = fs
    .readdirSync(GPX_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".gpx"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  let supabase = null;
  if (!isDryRun) {
    const { url, serviceRole } = assertEnv();
    supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  }

  let success = 0;
  let failed = 0;

  for (const gpxFile of gpxFiles) {
    const trackUid = gpxFile.replace(/\.gpx$/i, "");
    const gpxPath = path.join(GPX_DIR, gpxFile);
    const jsonPath = path.join(JSON_DIR, `${trackUid}.audit.v2.json`);

    try {
      if (!fs.existsSync(jsonPath)) {
        throw new Error(`Missing audit JSON: ${jsonPath}`);
      }

      const gpxRaw = fs.readFileSync(gpxPath, "utf8");
      const auditRaw = fs.readFileSync(jsonPath, "utf8");
      const payload = JSON.parse(auditRaw);

      const gpxHash = sha256(gpxRaw);
      const auditHash = sha256(auditRaw);
      const auditObjPath = auditObjectPath(trackUid, payload);
      const rawObjPath = gpxObjectPath(trackUid);

      if (isDryRun) {
        console.log(
          `DRY_RUN track_uid=${trackUid} audit=${auditBucket}/${auditObjPath} raw=${rawBucket}/${rawObjPath}`
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
      if (auditUploadError) throw new Error(`Audit upload: ${auditUploadError.message}`);

      const { error: gpxUploadError } = await supabase.storage
        .from(rawBucket)
        .upload(rawObjPath, Buffer.from(gpxRaw, "utf8"), {
          contentType: "application/gpx+xml",
          upsert: true,
        });
      if (gpxUploadError) throw new Error(`GPX upload: ${gpxUploadError.message}`);

      const { data: updatedTrack, error: updateError } = await supabase
        .from("tracks")
        .update({
          audit_detail_path: auditObjPath,
          audit_detail_hash: auditHash,
          raw_gpx_path: rawObjPath,
          raw_gpx_hash: gpxHash,
        })
        .eq("track_uid", trackUid)
        .select("id, track_uid, audit_detail_path, raw_gpx_path")
        .maybeSingle();

      if (updateError) throw new Error(`Track update: ${updateError.message}`);
      if (!updatedTrack) {
        throw new Error(`No tracks row for track_uid=${trackUid} (uploads OK — run import first)`);
      }

      console.log(
        `UPLOAD_OK track_id=${updatedTrack.id} track_uid=${trackUid} audit=${updatedTrack.audit_detail_path} raw=${updatedTrack.raw_gpx_path}`
      );
      success += 1;
    } catch (err) {
      failed += 1;
      console.error(`UPLOAD_FAIL track_uid=${trackUid} reason=${err.message || String(err)}`);
    }
  }

  console.log(
    `DONE files=${gpxFiles.length} success=${success} failed=${failed} dryRun=${isDryRun}`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
