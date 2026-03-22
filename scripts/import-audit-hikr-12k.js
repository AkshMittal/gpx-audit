#!/usr/bin/env node
/**
 * Upsert v2 audit JSON into Supabase (tracks + child tables).
 * Sets tracks.data_source = "hikr_12k" for every row.
 *
 * Usage: node scripts/import-audit-hikr-12k.js --dir <audit-json-dir> [--limit N] [--offset N] [--dry-run]
 *    or: node scripts/import-audit-hikr-12k.js --file <one.audit.v2.json> [--dry-run]
 */
"use strict";

const { runImportAuditCli } = require("./lib/audit-supabase-import-core.js");

const DATA_SOURCE = "hikr_12k";

runImportAuditCli({
  dataSource: DATA_SOURCE,
  scriptName: "import-audit-hikr-12k",
}).catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
