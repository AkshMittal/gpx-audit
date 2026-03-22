import { getCaseStudyConfig } from "./case-study-config.js";
import { createInitialState, countActiveFilters, resetFilters } from "./case-study-state.js";
import { createCaseStudyDataAccess } from "./case-study-data.js";
import {
  buildAnomalyIndex,
  prettyJson,
  highlightFirstMatch,
  groupAnomalies,
} from "./case-study-inspector.js";

const FILTER_SCHEMA = [
  {
    id: "identity",
    label: "Identity",
    fields: [
      { key: "trackUidContains", label: "track_uid contains", type: "text" },
      { key: "sourceFileNameContains", label: "source_file_name contains", type: "text" },
      { key: "schemaVersion", label: "schema_version", type: "text" },
      {
        key: "dataSource",
        label: "data_source",
        type: "select",
        options: [
          { value: "any", label: "any" },
          { value: "hikr_12k", label: "hikr_12k" },
          { value: "custom-test", label: "custom-test" },
        ],
      },
      { key: "summaryTotalPointMin", label: "summary_total_point_count min", type: "number" },
      { key: "summaryTotalPointMax", label: "summary_total_point_count max", type: "number" },
    ],
  },
  {
    id: "ingestion",
    label: "Ingestion",
    fields: [
      { key: "ingestionValidPointMin", label: "valid_point_count min", type: "number" },
      { key: "ingestionValidPointMax", label: "valid_point_count max", type: "number" },
      { key: "ingestionRejectedPointMin", label: "rejected_point_count min", type: "number" },
      { key: "ingestionRejectedPointMax", label: "rejected_point_count max", type: "number" },
      {
        key: "hasAnyTimestampValues",
        label: "has_any_timestamp_values",
        type: "select",
        options: [
          { value: "any", label: "any" },
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
    ],
  },
  {
    id: "temporal",
    label: "Temporal",
    fields: [
      { key: "missingRatioMin", label: "missing_ratio min", type: "number", step: "0.001" },
      { key: "missingRatioMax", label: "missing_ratio max", type: "number", step: "0.001" },
      { key: "unparsableRatioMin", label: "unparsable_ratio min", type: "number", step: "0.001" },
      { key: "unparsableRatioMax", label: "unparsable_ratio max", type: "number", step: "0.001" },
      { key: "duplicateRatioMin", label: "duplicate_ratio min", type: "number", step: "0.001" },
      { key: "duplicateRatioMax", label: "duplicate_ratio max", type: "number", step: "0.001" },
      { key: "backtrackingPointCountMin", label: "backtracking_point_count min", type: "number" },
    ],
  },
  {
    id: "sampling",
    label: "Sampling",
    fields: [
      {
        key: "hasAnyPositiveTimeDelta",
        label: "has_any_positive_time_delta",
        type: "select",
        options: [
          { value: "any", label: "any" },
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
      {
        key: "sequentialOverSortedClusterRatioMin",
        label: "sequential_over_sorted_cluster_count_ratio min",
        type: "number",
        step: "0.001",
      },
      {
        key: "sequentialOverSortedClusterRatioMax",
        label: "sequential_over_sorted_cluster_count_ratio max",
        type: "number",
        step: "0.001",
      },
      { key: "sortedClusterCountMin", label: "sorted_cluster_count min", type: "number" },
    ],
  },
  {
    id: "motion",
    label: "Motion",
    fields: [
      {
        key: "invalidTimeShareMin",
        label: "invalid_time_share_of_evaluated_time min",
        type: "number",
        step: "0.001",
      },
      {
        key: "invalidTimeShareMax",
        label: "invalid_time_share_of_evaluated_time max",
        type: "number",
        step: "0.001",
      },
      { key: "forwardValidPairCountMin", label: "forward_valid_pair_count min", type: "number" },
    ],
  },
];

function scalarColumn(key, sortField = key) {
  return { key, label: key, sortField, get: (r) => formatCellValue(r[key]) };
}

function relationColumn(prefix, key) {
  return {
    key: `${prefix}.${key}`,
    label: key,
    sortField: `${prefix}.${key}`,
    get: (r) => formatCellValue(r[prefix]?.[key]),
  };
}

function formatCellValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(3);
  }
  return String(value);
}

const TABLE_PRESETS = {
  tracks: [
    scalarColumn("track_uid", "track_uid"),
    scalarColumn("id"),
    scalarColumn("data_source"),
    scalarColumn("schema_version"),
    scalarColumn("generated_at_utc"),
    scalarColumn("source_file_name"),
    scalarColumn("summary_total_point_count"),
  ],
  ingestion_metrics: [
    scalarColumn("track_uid", "track_uid"),
    relationColumn("ingestion", "track_id"),
    relationColumn("ingestion", "total_point_count"),
    relationColumn("ingestion", "valid_point_count"),
    relationColumn("ingestion", "rejected_point_count"),
    relationColumn("ingestion", "point_type_wpt_count"),
    relationColumn("ingestion", "point_type_rtept_count"),
    relationColumn("ingestion", "point_type_trkpt_count"),
    relationColumn("ingestion", "has_multiple_point_types"),
    relationColumn("ingestion", "has_any_timestamp_values"),
  ],
  temporal_metrics: [
    scalarColumn("track_uid", "track_uid"),
    relationColumn("temporal", "track_id"),
    relationColumn("temporal", "total_points_evaluated"),
    relationColumn("temporal", "raw_session_duration_sec"),
    relationColumn("temporal", "parseable_timestamp_point_count"),
    relationColumn("temporal", "monotonic_forward_count"),
    relationColumn("temporal", "missing_point_count"),
    relationColumn("temporal", "missing_point_count_over_total_points_ratio"),
    relationColumn("temporal", "missing_max_block_length"),
    relationColumn("temporal", "missing_isolated_point_count"),
    relationColumn("temporal", "unparsable_point_count"),
    relationColumn("temporal", "unparsable_point_count_over_total_points_ratio"),
    relationColumn("temporal", "unparsable_max_block_length"),
    relationColumn("temporal", "unparsable_isolated_point_count"),
    relationColumn("temporal", "duplicate_point_count"),
    relationColumn("temporal", "duplicate_point_count_over_total_points_ratio"),
    relationColumn("temporal", "duplicate_max_block_length"),
    relationColumn("temporal", "duplicate_isolated_point_count"),
    relationColumn("temporal", "backtracking_point_count"),
    relationColumn("temporal", "backtracking_max_depth_from_anchor_ms"),
    relationColumn("temporal", "backtracking_max_block_length"),
    relationColumn("temporal", "backtracking_isolated_point_count"),
  ],
  sampling_metrics: [
    scalarColumn("track_uid", "track_uid"),
    relationColumn("sampling", "track_id"),
    relationColumn("sampling", "has_any_parseable_timestamp"),
    relationColumn("sampling", "has_any_positive_time_delta"),
    relationColumn("sampling", "timestamped_points_count"),
    relationColumn("sampling", "consecutive_timestamp_pairs_count"),
    relationColumn("sampling", "positive_time_delta_count"),
    relationColumn("sampling", "non_positive_time_delta_pair_count"),
    relationColumn("sampling", "positive_delta_count"),
    relationColumn("sampling", "delta_min_ms"),
    relationColumn("sampling", "delta_max_ms"),
    relationColumn("sampling", "delta_median_ms"),
    relationColumn("sampling", "insertion_relative_threshold"),
    relationColumn("sampling", "sorted_cluster_count"),
    relationColumn("sampling", "sequential_cluster_count"),
    relationColumn("sampling", "sorted_cluster_count_over_total_deltas_ratio"),
    relationColumn("sampling", "sequential_cluster_count_over_total_deltas_ratio"),
    relationColumn("sampling", "sequential_over_sorted_cluster_count_ratio"),
    relationColumn("sampling", "mean_final_absolute_deviation_sec"),
    relationColumn("sampling", "max_final_absolute_deviation_sec"),
    relationColumn("sampling", "mean_final_relative_deviation"),
    relationColumn("sampling", "max_final_relative_deviation"),
    relationColumn("sampling", "non_zero_final_deviation_count"),
    relationColumn("sampling", "zero_final_deviation_count"),
    relationColumn("sampling", "distance_consecutive_pair_count"),
    relationColumn("sampling", "invalid_distance_rejection_count"),
    // sampling_metrics: two columns — geometry-conditioned (valid-distance pairs) vs time-conditioned (positive dt pairs)
    relationColumn("sampling", "geometry_conditioned_delta_count"),
    relationColumn("sampling", "time_conditioned_delta_count"),
  ],
  motion_metrics: [
    scalarColumn("track_uid", "track_uid"),
    relationColumn("motion", "track_id"),
    relationColumn("motion", "consecutive_pair_count"),
    relationColumn("motion", "forward_valid_pair_count"),
    relationColumn("motion", "missing_timestamp_pair_count"),
    relationColumn("motion", "unparsable_timestamp_pair_count"),
    relationColumn("motion", "non_finite_distance_pair_count"),
    relationColumn("motion", "backward_time_pair_count"),
    relationColumn("motion", "zero_time_delta_pair_count"),
    relationColumn("motion", "valid_motion_time_seconds"),
    relationColumn("motion", "invalid_time_seconds"),
    relationColumn("motion", "invalid_time_share_of_evaluated_time"),
    relationColumn("motion", "total_forward_valid_distance_meters"),
    relationColumn("motion", "mean_speed_mps"),
    relationColumn("motion", "median_speed_mps"),
    relationColumn("motion", "max_speed_mps"),
  ],
};

let state;
let dataAccess;
let listRequestNonce = 0;
let detailRequestNonce = 0;
const detailCache = new Map();

function setStatus(text, isError = false) {
  const statusEl = document.getElementById("detailStatus");
  if (!statusEl) return;
  statusEl.textContent = text || "";
  statusEl.classList.toggle("error", Boolean(isError));
}

function renderFilterRail() {
  const container = document.getElementById("filterContainer");
  const actionBar = document.getElementById("filterActionsBar");
  container.innerHTML = "";
  if (actionBar) actionBar.innerHTML = "";

  FILTER_SCHEMA.forEach((category) => {
    const catEl = document.createElement("section");
    catEl.className = "filter-category";
    if (category.id === "identity") catEl.classList.add("open");

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "cat-toggle";
    toggleBtn.textContent = category.label;
    toggleBtn.addEventListener("click", () => catEl.classList.toggle("open"));
    catEl.appendChild(toggleBtn);

    const body = document.createElement("div");
    body.className = "cat-body";

    category.fields.forEach((field) => {
      const wrap = document.createElement("div");
      wrap.className = "field";

      const label = document.createElement("label");
      label.textContent = field.label;
      wrap.appendChild(label);

      let input;
      if (field.type === "select") {
        input = document.createElement("select");
        field.options.forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          input.appendChild(option);
        });
      } else {
        input = document.createElement("input");
        input.type = field.type || "text";
        if (field.step) input.step = field.step;
      }
      input.value = state.filters[field.key] || "";
      input.addEventListener("input", () => {
        state.filters[field.key] = input.value;
      });
      wrap.appendChild(input);
      body.appendChild(wrap);
    });

    const clearCategoryBtn = document.createElement("button");
    clearCategoryBtn.type = "button";
    clearCategoryBtn.textContent = `Clear ${category.label}`;
    clearCategoryBtn.addEventListener("click", () => {
      category.fields.forEach((field) => {
        const empty = field.type === "select" ? "any" : "";
        state.filters[field.key] = empty;
        state.appliedFilters[field.key] = empty;
      });
      renderFilterRail();
      renderActiveFilterChips();
      state.page = 1;
      refreshTrackList();
    });
    body.appendChild(clearCategoryBtn);
    catEl.appendChild(body);
    container.appendChild(catEl);
  });

  const actionWrap = document.createElement("div");
  actionWrap.innerHTML = `
    <button type="button" class="btn-primary" id="applyFiltersBtn">Apply filters</button>
    <button type="button" id="resetFiltersBtn">Reset all</button>
  `;
  if (actionBar) actionBar.appendChild(actionWrap);

  document.getElementById("applyFiltersBtn").addEventListener("click", () => {
    state.appliedFilters = { ...state.filters };
    state.page = 1;
    renderActiveFilterChips();
    refreshTrackList();
  });
  document.getElementById("resetFiltersBtn").addEventListener("click", () => {
    resetFilters(state);
    renderFilterRail();
    renderActiveFilterChips();
    refreshTrackList();
  });

  renderActiveFilterChips();
}

function renderPresetTabs() {
  const tabWrap = document.getElementById("presetTabs");
  tabWrap.innerHTML = "";
  Object.keys(TABLE_PRESETS).forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `preset-tab ${state.selectedPreset === preset ? "active" : ""}`;
    btn.textContent = preset;
    btn.addEventListener("click", () => {
      state.selectedPreset = preset;
      state.page = 1;
      renderPresetTabs();
      refreshTrackList();
    });
    tabWrap.appendChild(btn);
  });
}

function renderActiveFilterChips() {
  const chipsWrap = document.getElementById("activeFilterChips");
  chipsWrap.innerHTML = "";
  const activeCount = countActiveFilters(state.appliedFilters);
  document.getElementById("activeFilterCount").textContent = `${activeCount} active`;

  Object.entries(state.appliedFilters).forEach(([key, value]) => {
    if (value === "" || value === "any") return;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = `${key}: ${value} ×`;
    chip.addEventListener("click", () => {
      const empty =
        key === "dataSource" || key.toLowerCase().includes("has") ? "any" : "";
      state.filters[key] = empty;
      state.appliedFilters[key] = empty;
      renderFilterRail();
      renderActiveFilterChips();
      state.page = 1;
      refreshTrackList();
    });
    chipsWrap.appendChild(chip);
  });
}

function formatSortFieldLabel(sortField) {
  if (!sortField.includes(".")) return `tracks.${sortField}`;
  const [prefix, column] = sortField.split(".", 2);
  const tableByPrefix = {
    ingestion: "ingestion_metrics",
    temporal: "temporal_metrics",
    sampling: "sampling_metrics",
    motion: "motion_metrics",
  };
  return `${tableByPrefix[prefix] || prefix}.${column}`;
}

function renderActiveSortState() {
  const target = document.getElementById("activeSortState");
  if (!target) return;
  target.innerHTML = "";
  const chip = document.createElement("span");
  chip.className = "sort-chip";
  const arrow = state.sort.direction === "asc" ? "asc" : "desc";
  chip.textContent = `sort: ${formatSortFieldLabel(state.sort.field)} (${arrow})`;
  target.appendChild(chip);
}

function setCacheLoadingOverlay(visible, message = "Database loading...") {
  const overlay = document.getElementById("cacheLoadingOverlay");
  const textEl = document.getElementById("cacheLoadingMessage");
  if (textEl) textEl.textContent = message;
  if (overlay) {
    overlay.classList.toggle("open", Boolean(visible));
  }
}

function toBoolFilterValue(rawValue) {
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  return null;
}

function readSortValue(row, sortField) {
  if (!sortField || !sortField.includes(".")) return row?.[sortField];
  const [prefix, key] = sortField.split(".", 2);
  return row?.[prefix]?.[key];
}

function parseNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function matchesRange(value, minValue, maxValue) {
  const numberValue = parseNumberOrNull(value);
  if (minValue !== "") {
    const min = parseNumberOrNull(minValue);
    if (min === null || numberValue === null || numberValue < min) return false;
  }
  if (maxValue !== "") {
    const max = parseNumberOrNull(maxValue);
    if (max === null || numberValue === null || numberValue > max) return false;
  }
  return true;
}

function applyLocalFilters(rows, filters) {
  const uidNeedle = String(filters.trackUidContains || "").trim().toLowerCase();
  const sourceNeedle = String(filters.sourceFileNameContains || "").trim().toLowerCase();
  const hasAnyTimestampValues = toBoolFilterValue(filters.hasAnyTimestampValues);
  const hasAnyPositiveTimeDelta = toBoolFilterValue(filters.hasAnyPositiveTimeDelta);

  return rows.filter((row) => {
    if (uidNeedle && !String(row.track_uid || "").toLowerCase().includes(uidNeedle)) return false;
    if (sourceNeedle && !String(row.source_file_name || "").toLowerCase().includes(sourceNeedle)) return false;
    if (filters.schemaVersion && row.schema_version !== filters.schemaVersion) return false;

    if (
      filters.dataSource &&
      filters.dataSource !== "any" &&
      String(row.data_source || "") !== filters.dataSource
    ) {
      return false;
    }

    if (
      !matchesRange(
        row.summary_total_point_count,
        filters.summaryTotalPointMin,
        filters.summaryTotalPointMax
      )
    ) {
      return false;
    }

    if (
      !matchesRange(
        row.ingestion?.valid_point_count,
        filters.ingestionValidPointMin,
        filters.ingestionValidPointMax
      )
    ) {
      return false;
    }

    if (
      !matchesRange(
        row.ingestion?.rejected_point_count,
        filters.ingestionRejectedPointMin,
        filters.ingestionRejectedPointMax
      )
    ) {
      return false;
    }

    if (
      hasAnyTimestampValues !== null &&
      Boolean(row.ingestion?.has_any_timestamp_values) !== hasAnyTimestampValues
    ) {
      return false;
    }

    if (
      !matchesRange(
        row.temporal?.missing_point_count_over_total_points_ratio,
        filters.missingRatioMin,
        filters.missingRatioMax
      )
    ) {
      return false;
    }

    if (
      !matchesRange(
        row.temporal?.unparsable_point_count_over_total_points_ratio,
        filters.unparsableRatioMin,
        filters.unparsableRatioMax
      )
    ) {
      return false;
    }

    if (
      !matchesRange(
        row.temporal?.duplicate_point_count_over_total_points_ratio,
        filters.duplicateRatioMin,
        filters.duplicateRatioMax
      )
    ) {
      return false;
    }

    if (!matchesRange(row.temporal?.backtracking_point_count, filters.backtrackingPointCountMin, "")) {
      return false;
    }

    if (
      hasAnyPositiveTimeDelta !== null &&
      Boolean(row.sampling?.has_any_positive_time_delta) !== hasAnyPositiveTimeDelta
    ) {
      return false;
    }

    if (
      !matchesRange(
        row.sampling?.sequential_over_sorted_cluster_count_ratio,
        filters.sequentialOverSortedClusterRatioMin,
        filters.sequentialOverSortedClusterRatioMax
      )
    ) {
      return false;
    }

    if (!matchesRange(row.sampling?.sorted_cluster_count, filters.sortedClusterCountMin, "")) {
      return false;
    }

    if (
      !matchesRange(
        row.motion?.invalid_time_share_of_evaluated_time,
        filters.invalidTimeShareMin,
        filters.invalidTimeShareMax
      )
    ) {
      return false;
    }

    if (!matchesRange(row.motion?.forward_valid_pair_count, filters.forwardValidPairCountMin, "")) {
      return false;
    }

    return true;
  });
}

function compareValues(a, b) {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);

  const aNum = parseNumberOrNull(a);
  const bNum = parseNumberOrNull(b);
  if (aNum !== null && bNum !== null) return aNum - bNum;

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function sortRows(rows, sort) {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const cmp = compareValues(readSortValue(left, sort.field), readSortValue(right, sort.field));
    if (cmp !== 0) return cmp * direction;
    return Number(right.id || 0) - Number(left.id || 0);
  });
}

function renderTable() {
  const columns = TABLE_PRESETS[state.selectedPreset] || TABLE_PRESETS.tracks;
  renderActiveSortState();
  const head = document.getElementById("tableHead");
  const body = document.getElementById("tableBody");
  head.innerHTML = "";
  body.innerHTML = "";

  const trHead = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    if (col.sortField) {
      th.classList.add("sortable");
      const arrow = state.sort.field === col.sortField ? (state.sort.direction === "asc" ? " ▲" : " ▼") : "";
      th.textContent += arrow;
      th.addEventListener("click", () => {
        if (state.sort.field === col.sortField) {
          state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
        } else {
          state.sort.field = col.sortField;
          state.sort.direction = "asc";
        }
        refreshTrackList();
      });
    }
    trHead.appendChild(th);
  });
  head.appendChild(trHead);

  if (state.rows.length === 0) {
    const empty = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.textContent = state.loadingList ? "Loading..." : "No rows for current filters.";
    empty.appendChild(td);
    body.appendChild(empty);
    return;
  }

  state.rows.forEach((row) => {
    const tr = document.createElement("tr");
    if (row.track_uid === state.selectedTrackUid) tr.classList.add("selected");
    tr.addEventListener("click", () => selectTrack(row.track_uid));

    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = String(col.get(row));
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function renderPageMeta() {
  const totalPages = Math.max(1, Math.ceil(state.totalCount / state.pageSize));
  document.getElementById("resultCountLabel").textContent = `${state.totalCount.toLocaleString()} tracks`;
  document.getElementById("pageMeta").textContent = `page ${state.page} / ${totalPages}`;
  document.getElementById("prevPageBtn").disabled = state.page <= 1 || state.loadingList;
  document.getElementById("nextPageBtn").disabled = state.page >= totalPages || state.loadingList;
}

async function refreshTrackList() {
  const nonce = ++listRequestNonce;
  state.loadingList = true;
  state.listError = "";
  renderTable();
  renderPageMeta();

  try {
    let result;
    if (state.config.clientCacheMode !== false) {
      if (!state.cacheLoaded) {
        setCacheLoadingOverlay(true, "Database loading...");
        setStatus("Loading full track cache...");
        const cached = await dataAccess.listAllTracks();
        if (nonce !== listRequestNonce) return;
        state.allRows = cached.rows;
        state.cacheLoaded = true;
        setCacheLoadingOverlay(false);
        setStatus("");
      }

      const filtered = applyLocalFilters(state.allRows, state.appliedFilters);
      const sorted = sortRows(filtered, state.sort);
      const totalCount = sorted.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / state.pageSize));
      if (state.page > totalPages) {
        state.page = totalPages;
      }
      const rangeStart = (state.page - 1) * state.pageSize;
      const rangeEnd = rangeStart + state.pageSize;
      result = {
        rows: sorted.slice(rangeStart, rangeEnd),
        totalCount,
      };
    } else {
      setCacheLoadingOverlay(false);
      result = await dataAccess.listTracks({
        filters: state.appliedFilters,
        page: state.page,
        pageSize: state.pageSize,
        sort: state.sort,
      });
    }

    if (nonce !== listRequestNonce) return;
    state.rows = result.rows;
    state.totalCount = result.totalCount;
    renderTable();
    renderPageMeta();

    if (state.selectedTrackUid && !state.rows.some((r) => r.track_uid === state.selectedTrackUid)) {
      state.selectedTrackUid = "";
      state.selectedDetail = null;
      renderDetailPanel();
    }
  } catch (error) {
    if (nonce !== listRequestNonce) return;
    setCacheLoadingOverlay(false);
    state.listError = error.message || String(error);
    state.rows = [];
    state.totalCount = 0;
    renderTable();
    renderPageMeta();
    setStatus(state.listError, true);
  } finally {
    if (state.cacheLoaded) setCacheLoadingOverlay(false);
    if (nonce === listRequestNonce) {
      state.loadingList = false;
      renderTable();
      renderPageMeta();
    }
  }
}

function kvCard(key, value) {
  return `<div class="kv"><div class="k">${key}</div><div class="v">${value ?? "—"}</div></div>`;
}

function humanizeKey(key) {
  return String(key || "")
    .replaceAll("_", " ")
    .trim();
}

function formatDetailValue(key, value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    const name = String(key || "");
    if (name.includes("ratio") || name.includes("share") || name.includes("deviation")) {
      return value.toFixed(3);
    }
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(3);
  }
  return String(value);
}

function renderMetricSection(title, obj, excludeKeys = []) {
  if (!obj) {
    return `
      <section class="detail-section">
        <h4>${title}</h4>
        <div class="kv-grid">${kvCard("status", "—")}</div>
      </section>
    `;
  }

  const excluded = new Set(excludeKeys);
  const entries = Object.entries(obj).filter(([k]) => !excluded.has(k));
  entries.sort(([a], [b]) => a.localeCompare(b));
  const cells = entries.map(([k, v]) => kvCard(humanizeKey(k), formatDetailValue(k, v))).join("");
  return `
    <section class="detail-section">
      <h4>${title}</h4>
      <div class="kv-grid">${cells || kvCard("status", "—")}</div>
    </section>
  `;
}

function renderDetailPanel() {
  const body = document.getElementById("detailBody");
  const label = document.getElementById("selectedTrackLabel");

  if (!state.selectedDetail) {
    label.textContent = "none selected";
    body.innerHTML = `<div class="detail-empty">Select a track row to inspect full per-track detail.</div>`;
    return;
  }

  const detail = state.selectedDetail;
  label.textContent = detail.track_uid;

  const tracksSection = renderMetricSection("tracks", {
    id: detail.id,
    track_uid: detail.track_uid,
    data_source: detail.data_source,
    schema_version: detail.schema_version,
    generated_at_utc: detail.generated_at_utc,
    source_file_name: detail.source_file_name,
    summary_total_point_count: detail.summary_total_point_count,
  });

  const ingestionSection = renderMetricSection("ingestion_metrics", detail.ingestion);
  const temporalSection = renderMetricSection("temporal_metrics", detail.temporal);
  const samplingSection = renderMetricSection("sampling_metrics", detail.sampling);
  const motionSection = renderMetricSection("motion_metrics", detail.motion);

  body.innerHTML = `
    ${tracksSection}
    ${ingestionSection}
    ${temporalSection}
    ${samplingSection}
    ${motionSection}
    <section class="detail-section">
      <h4>Artifacts</h4>
      <div class="artifact-actions">
        <button type="button" id="openInspectorBtn">Open deep inspector</button>
        <button type="button" id="downloadGpxBtn">Download raw GPX</button>
      </div>
    </section>
  `;

  const openInspectorBtn = document.getElementById("openInspectorBtn");
  if (openInspectorBtn) openInspectorBtn.addEventListener("click", () => openInspector());

  const downloadGpxBtn = document.getElementById("downloadGpxBtn");
  if (downloadGpxBtn) downloadGpxBtn.addEventListener("click", () => downloadRawGpx());

}

async function selectTrack(trackUid) {
  state.selectedTrackUid = trackUid;
  state.loadingDetail = true;
  state.detailError = "";
  renderTable();

  if (detailCache.has(trackUid)) {
    state.selectedDetail = detailCache.get(trackUid);
    state.loadingDetail = false;
    renderDetailPanel();
    setStatus("");
    return;
  }

  const nonce = ++detailRequestNonce;
  try {
    const detail = await dataAccess.getTrackDetail(trackUid);
    if (nonce !== detailRequestNonce) return;
    detailCache.set(trackUid, detail);
    if (detailCache.size > 40) {
      const oldestKey = detailCache.keys().next().value;
      detailCache.delete(oldestKey);
    }
    state.selectedDetail = detail;
    renderDetailPanel();
    setStatus("");
  } catch (error) {
    if (nonce !== detailRequestNonce) return;
    state.detailError = error.message || String(error);
    setStatus(state.detailError, true);
  } finally {
    if (nonce === detailRequestNonce) state.loadingDetail = false;
  }
}

async function downloadRawGpx() {
  const detail = state.selectedDetail;
  if (!detail?.raw_gpx_path) {
    setStatus("No raw GPX path available for selected track.", true);
    return;
  }
  try {
    setStatus("Downloading raw GPX...");
    const text = await dataAccess.downloadRawGpxText(detail.raw_gpx_path);
    const blob = new Blob([text], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detail.track_uid}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Raw GPX downloaded.");
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

function getFilteredInspectorAnomalies() {
  const grouped = groupAnomalies(state.inspectorAnomalies, state.inspectorFilteredType);
  return grouped.map((item, idx) => ({
    item,
    globalIdx: state.inspectorAnomalies.indexOf(item),
    filteredIdx: idx,
  }));
}

function renderInspector() {
  const typeSelect = document.getElementById("anomalyTypeSelect");
  const summary = document.getElementById("inspectorSummary");
  const listEl = document.getElementById("anomalyList");
  const jsonView = document.getElementById("jsonView");

  const typeEntries = [{ value: "all", label: "all finding types" }];
  const findingTypeMap = new Map();
  state.inspectorAnomalies.forEach((item) => {
    const key = `${item.type}:${item.subtype}`;
    if (!findingTypeMap.has(key)) {
      findingTypeMap.set(key, item.findingClass === "diagnostic" ? "diagnostic" : "anomaly");
    }
  });
  [...findingTypeMap.entries()].forEach(([key, findingClass]) =>
    typeEntries.push({ value: key, label: `${findingClass} | ${key}` })
  );

  typeSelect.innerHTML = "";
  typeEntries.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.value;
    opt.textContent = entry.label;
    typeSelect.appendChild(opt);
  });
  typeSelect.value = state.inspectorFilteredType;

  const filtered = getFilteredInspectorAnomalies();
  summary.textContent = `${filtered.length} findings`;

  listEl.innerHTML = "";
  filtered.forEach((entry) => {
    const div = document.createElement("article");
    div.className = "anomaly-item";
    if (entry.globalIdx === state.inspectorSelectedIdx) div.classList.add("selected");
    const findingClass = entry.item.findingClass === "diagnostic" ? "diagnostic" : "anomaly";
    div.innerHTML = `<strong>${entry.item.label}</strong><span class="finding-badge ${findingClass}">${findingClass}</span><div>${entry.item.summary}</div><code>${entry.item.path}</code>`;
    div.addEventListener("click", () => {
      state.inspectorSelectedIdx = entry.globalIdx;
      renderInspector();
    });
    listEl.appendChild(div);
  });

  let highlighted = state.inspectorRawJson;
  let selectedPath = "";
  const selected = state.inspectorAnomalies[state.inspectorSelectedIdx];
  if (selected) {
    highlighted = highlightFirstMatch(state.inspectorRawJson, selected.highlightTerm || "");
    selectedPath = selected.path;
  } else {
    highlighted = highlightFirstMatch(state.inspectorRawJson, "");
  }

  jsonView.innerHTML = highlighted;
  requestAnimationFrame(() => {
    const mark = jsonView.querySelector("mark");
    if (mark) mark.scrollIntoView({ block: "center" });
  });

  const copyPathBtn = document.getElementById("copyPathBtn");
  copyPathBtn.disabled = !selectedPath;
}

async function openInspector() {
  const detail = state.selectedDetail;
  if (!detail?.audit_detail_path) {
    setStatus("No audit JSON path available for selected track.", true);
    return;
  }
  const modal = document.getElementById("inspectorModal");
  modal.classList.add("open");
  state.inspectorOpen = true;
  state.inspectorLoading = true;
  state.inspectorError = "";
  state.inspectorRawJson = "";
  state.inspectorAnomalies = [];
  state.inspectorFilteredType = "all";
  state.inspectorSelectedIdx = -1;
  document.getElementById("anomalyList").innerHTML = "Loading audit JSON...";
  document.getElementById("jsonView").textContent = "";

  try {
    setStatus("Loading storage audit JSON...");
    const auditJson = await dataAccess.downloadAuditJson(detail.audit_detail_path);
    state.inspectorRawJson = prettyJson(auditJson);
    state.inspectorAnomalies = buildAnomalyIndex(auditJson);
    state.inspectorSelectedIdx = state.inspectorAnomalies.length ? 0 : -1;
    renderInspector();
    setStatus(`Deep inspector loaded (${state.inspectorAnomalies.length} indexed findings).`);
  } catch (error) {
    state.inspectorError = error.message || String(error);
    document.getElementById("anomalyList").textContent = state.inspectorError;
    setStatus(state.inspectorError, true);
  } finally {
    state.inspectorLoading = false;
  }
}

function bindGlobalEvents() {
  document.getElementById("prevPageBtn").addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      refreshTrackList();
    }
  });
  document.getElementById("nextPageBtn").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.totalCount / state.pageSize));
    if (state.page < totalPages) {
      state.page += 1;
      refreshTrackList();
    }
  });
  document.getElementById("pageSizeSelect").addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    refreshTrackList();
  });

  document.getElementById("closeInspectorBtn").addEventListener("click", () => {
    document.getElementById("inspectorModal").classList.remove("open");
    state.inspectorOpen = false;
  });

  document.getElementById("anomalyTypeSelect").addEventListener("change", (event) => {
    state.inspectorFilteredType = event.target.value;
    state.inspectorSelectedIdx = -1;
    const filtered = getFilteredInspectorAnomalies();
    if (filtered.length) state.inspectorSelectedIdx = filtered[0].globalIdx;
    renderInspector();
  });

  document.getElementById("prevAnomalyBtn").addEventListener("click", () => {
    const filtered = getFilteredInspectorAnomalies();
    if (!filtered.length) return;
    const current = filtered.findIndex((x) => x.globalIdx === state.inspectorSelectedIdx);
    const next = current <= 0 ? filtered[filtered.length - 1] : filtered[current - 1];
    state.inspectorSelectedIdx = next.globalIdx;
    renderInspector();
  });

  document.getElementById("nextAnomalyBtn").addEventListener("click", () => {
    const filtered = getFilteredInspectorAnomalies();
    if (!filtered.length) return;
    const current = filtered.findIndex((x) => x.globalIdx === state.inspectorSelectedIdx);
    const next = current < 0 || current >= filtered.length - 1 ? filtered[0] : filtered[current + 1];
    state.inspectorSelectedIdx = next.globalIdx;
    renderInspector();
  });

  document.getElementById("copyPathBtn").addEventListener("click", async () => {
    const selected = state.inspectorAnomalies[state.inspectorSelectedIdx];
    if (!selected) return;
    await navigator.clipboard.writeText(selected.path);
    setStatus(`Copied path: ${selected.path}`);
  });
}

async function init() {
  try {
    const config = getCaseStudyConfig();
    state = createInitialState(config);
    dataAccess = createCaseStudyDataAccess(config);

    document.getElementById("pageSizeSelect").value = String(state.pageSize);
    renderFilterRail();
    renderPresetTabs();
    renderTable();
    renderPageMeta();
    bindGlobalEvents();
    await refreshTrackList();
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

init();

