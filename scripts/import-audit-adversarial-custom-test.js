#!/usr/bin/env node
/**
 * Upsert adversarial / lab audit JSON into Supabase (tracks + child tables).
 * Sets tracks.data_source = "custom-test" for every row.
 * Put GPX + JSON in storage separately (e.g. upload-audit-json-to-storage.js); this script is DB only.
 *
 * Usage: node scripts/import-audit-adversarial-custom-test.js --dir <audit-json-dir> [--limit N] [--offset N] [--dry-run]
 *    or: node scripts/import-audit-adversarial-custom-test.js --file <one.audit.v2.json> [--dry-run]
 */
"use strict";

const { runImportAuditCli } = require("./lib/audit-supabase-import-core.js");

const DATA_SOURCE = "custom-test";

runImportAuditCli({
  dataSource: DATA_SOURCE,
  scriptName: "import-audit-adversarial-custom-test",
}).catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
