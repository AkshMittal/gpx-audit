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
    id: "dataset",
    label: "Dataset & Identity",
    fields: [
      { key: "sourceDataset", label: "source_dataset", type: "text" },
      { key: "trackUidContains", label: "track_uid contains", type: "text" },
      { key: "validPointMin", label: "valid_point_count min", type: "number" },
      { key: "validPointMax", label: "valid_point_count max", type: "number" },
      { key: "rejectedPointMin", label: "rejected_point_count min", type: "number" },
      { key: "rejectedPointMax", label: "rejected_point_count max", type: "number" },
    ],
  },
  {
    id: "temporal",
    label: "Temporal",
    fields: [
      {
        key: "hasAnyTemporalAnomaly",
        label: "has_any_temporal_anomaly",
        type: "select",
        options: [
          { value: "any", label: "any" },
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
      {
        key: "hasAnyTemporalBlock",
        label: "has_any_temporal_block",
        type: "select",
        options: [
          { value: "any", label: "any" },
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
      {
        key: "hasAnyTemporalSinglePoint",
        label: "has_any_temporal_single_point",
        type: "select",
        options: [
          { value: "any", label: "any" },
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
      { key: "missingRatioMin", label: "missing_ratio min", type: "number", step: "0.001" },
      { key: "missingRatioMax", label: "missing_ratio max", type: "number", step: "0.001" },
      { key: "backtrackingCountMin", label: "backtracking_count min", type: "number" },
    ],
  },
  {
    id: "sampling",
    label: "Sampling",
    fields: [
      {
        key: "hasTimeProgression",
        label: "has_time_progression",
        type: "select",
        options: [
          { value: "any", label: "any" },
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
      {
        key: "samplingStabilityRatioMin",
        label: "sampling_stability_ratio min",
        type: "number",
        step: "0.001",
      },
      {
        key: "samplingStabilityRatioMax",
        label: "sampling_stability_ratio max",
        type: "number",
        step: "0.001",
      },
      { key: "clusterCountSortedMin", label: "cluster_count_sorted min", type: "number" },
    ],
  },
  {
    id: "motion",
    label: "Motion",
    fields: [
      {
        key: "hasMotionTimeContext",
        label: "has_motion_time_context",
        type: "select",
        options: [
          { value: "any", label: "any" },
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
      { key: "invalidTimeRatioMin", label: "invalid_time_ratio min", type: "number", step: "0.001" },
      { key: "invalidTimeRatioMax", label: "invalid_time_ratio max", type: "number", step: "0.001" },
    ],
  },
];

const TABLE_PRESETS = {
  overview: [
    { key: "track_uid", label: "track_uid", sortField: "track_uid", get: (r) => r.track_uid },
    { key: "source_dataset", label: "dataset", sortField: "source_dataset", get: (r) => r.source_dataset },
    {
      key: "valid_point_count",
      label: "valid_pts",
      sortField: "valid_point_count",
      get: (r) => formatNum(r.valid_point_count),
    },
    {
      key: "temporal_flag",
      label: "temporal",
      sortField: "missing_ratio",
      get: (r) => boolTag(r.temporal?.has_any_temporal_anomaly),
    },
    {
      key: "sampling_flag",
      label: "sampling",
      sortField: "sampling_stability_ratio",
      get: (r) => ratioTag(r.sampling?.sampling_stability_ratio),
    },
    {
      key: "motion_flag",
      label: "motion",
      sortField: "invalid_time_ratio",
      get: (r) => ratioTag(r.motion?.invalid_time_ratio),
    },
  ],
  temporal: [
    { key: "track_uid", label: "track_uid", sortField: "track_uid", get: (r) => r.track_uid },
    {
      key: "has_any_temporal_anomaly",
      label: "any_anomaly",
      sortField: "missing_ratio",
      get: (r) => yesNo(r.temporal?.has_any_temporal_anomaly),
    },
    {
      key: "has_any_temporal_block",
      label: "any_block",
      sortField: "backtracking_count",
      get: (r) => yesNo(r.temporal?.has_any_temporal_block),
    },
    {
      key: "has_any_temporal_single_point",
      label: "any_single",
      sortField: "backtracking_count",
      get: (r) => yesNo(r.temporal?.has_any_temporal_single_point),
    },
    { key: "missing_ratio", label: "missing_ratio", sortField: "missing_ratio", get: (r) => formatRatio(r.temporal?.missing_ratio) },
    { key: "backtracking_count", label: "backtracking_count", sortField: "backtracking_count", get: (r) => formatNum(r.temporal?.backtracking_count) },
  ],
  sampling: [
    { key: "track_uid", label: "track_uid", sortField: "track_uid", get: (r) => r.track_uid },
    { key: "has_time_progression", label: "time_progression", sortField: "sampling_stability_ratio", get: (r) => yesNo(r.sampling?.has_time_progression) },
    { key: "sampling_stability_ratio", label: "stability_ratio", sortField: "sampling_stability_ratio", get: (r) => formatRatio(r.sampling?.sampling_stability_ratio) },
    { key: "cluster_count_sorted", label: "cluster_count_sorted", sortField: "cluster_count_sorted", get: (r) => formatNum(r.sampling?.cluster_count_sorted) },
    { key: "global_final_max_relative_deviation", label: "max_rel_dev", sortField: "sampling_stability_ratio", get: (r) => formatRatio(r.sampling?.global_final_max_relative_deviation) },
  ],
  motion: [
    { key: "track_uid", label: "track_uid", sortField: "track_uid", get: (r) => r.track_uid },
    { key: "has_motion_time_context", label: "has_context", sortField: "invalid_time_ratio", get: (r) => yesNo(r.motion?.has_motion_time_context) },
    { key: "invalid_time_ratio", label: "invalid_time_ratio", sortField: "invalid_time_ratio", get: (r) => formatRatio(r.motion?.invalid_time_ratio) },
    { key: "mean_speed_mps", label: "mean_speed_mps", sortField: "invalid_time_ratio", get: (r) => formatFloat(r.motion?.mean_speed_mps) },
    { key: "max_speed_mps", label: "max_speed_mps", sortField: "invalid_time_ratio", get: (r) => formatFloat(r.motion?.max_speed_mps) },
  ],
};

let state;
let dataAccess;
let listRequestNonce = 0;
let detailRequestNonce = 0;
const detailCache = new Map();

function formatNum(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
}

function formatFloat(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(2);
}

function formatRatio(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(3);
}

function yesNo(value) {
  if (value === null || value === undefined) return "—";
  return value ? "yes" : "no";
}

function boolTag(value) {
  if (value === null || value === undefined) return "—";
  return value ? "flagged" : "clean";
}

function ratioTag(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (n >= 0.4) return `high (${n.toFixed(2)})`;
  if (n >= 0.2) return `mid (${n.toFixed(2)})`;
  return `low (${n.toFixed(2)})`;
}

function setStatus(text, isError = false) {
  const statusEl = document.getElementById("detailStatus");
  statusEl.textContent = text || "";
  statusEl.classList.toggle("error", Boolean(isError));
}

function renderFilterRail() {
  const container = document.getElementById("filterContainer");
  container.innerHTML = "";

  FILTER_SCHEMA.forEach((category) => {
    const catEl = document.createElement("section");
    catEl.className = "filter-category";
    if (category.id === "dataset") catEl.classList.add("open");

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
        renderActiveFilterChips();
      });
      wrap.appendChild(input);
      body.appendChild(wrap);
    });

    const clearCategoryBtn = document.createElement("button");
    clearCategoryBtn.type = "button";
    clearCategoryBtn.textContent = `Clear ${category.label}`;
    clearCategoryBtn.addEventListener("click", () => {
      category.fields.forEach((field) => {
        state.filters[field.key] = field.type === "select" ? "any" : "";
      });
      renderFilterRail();
      renderActiveFilterChips();
    });
    body.appendChild(clearCategoryBtn);
    catEl.appendChild(body);
    container.appendChild(catEl);
  });

  const actionWrap = document.createElement("div");
  actionWrap.className = "filter-actions";
  actionWrap.innerHTML = `
    <button type="button" class="btn-primary" id="applyFiltersBtn">Apply filters</button>
    <button type="button" id="resetFiltersBtn">Reset all</button>
  `;
  container.appendChild(actionWrap);

  document.getElementById("applyFiltersBtn").addEventListener("click", () => {
    state.page = 1;
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
  const activeCount = countActiveFilters(state.filters);
  document.getElementById("activeFilterCount").textContent = `${activeCount} active`;

  Object.entries(state.filters).forEach(([key, value]) => {
    if (value === "" || value === "any") return;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = `${key}: ${value} ×`;
    chip.addEventListener("click", () => {
      state.filters[key] = key.toLowerCase().includes("has") ? "any" : "";
      renderFilterRail();
      renderActiveFilterChips();
      state.page = 1;
      refreshTrackList();
    });
    chipsWrap.appendChild(chip);
  });
}

function renderTable() {
  const columns = TABLE_PRESETS[state.selectedPreset];
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
  setStatus("Loading track list...");

  try {
    const result = await dataAccess.listTracks({
      filters: state.filters,
      page: state.page,
      pageSize: state.pageSize,
      sort: state.sort,
    });
    if (nonce !== listRequestNonce) return;
    state.rows = result.rows;
    state.totalCount = result.totalCount;
    renderTable();
    renderPageMeta();
    setStatus(`Loaded ${result.rows.length} rows (${state.totalCount.toLocaleString()} total).`);

    if (state.selectedTrackUid && !state.rows.some((r) => r.track_uid === state.selectedTrackUid)) {
      state.selectedTrackUid = "";
      state.selectedDetail = null;
      renderDetailPanel();
    }
  } catch (error) {
    if (nonce !== listRequestNonce) return;
    state.listError = error.message || String(error);
    state.rows = [];
    state.totalCount = 0;
    renderTable();
    renderPageMeta();
    setStatus(state.listError, true);
  } finally {
    if (nonce === listRequestNonce) state.loadingList = false;
  }
}

function kvCard(key, value) {
  return `<div class="kv"><div class="k">${key}</div><div class="v">${value ?? "—"}</div></div>`;
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

  body.innerHTML = `
    <section class="detail-section">
      <h4>Identity</h4>
      <div class="kv-grid">
        ${kvCard("track_uid", detail.track_uid)}
        ${kvCard("source_dataset", detail.source_dataset)}
        ${kvCard("total_point_count", formatNum(detail.total_point_count))}
        ${kvCard("valid_point_count", formatNum(detail.valid_point_count))}
      </div>
    </section>
    <section class="detail-section">
      <h4>Ingestion</h4>
      <div class="kv-grid">
        ${kvCard("rejected_point_count", formatNum(detail.rejected_point_count))}
        ${kvCard("has_multiple_point_types", yesNo(detail.has_multiple_point_types))}
        ${kvCard("has_any_timestamps", yesNo(detail.has_any_timestamps))}
        ${kvCard("schema_version", detail.schema_version || "—")}
      </div>
    </section>
    <section class="detail-section">
      <h4>Temporal</h4>
      <div class="kv-grid">
        ${kvCard("has_any_temporal_anomaly", yesNo(detail.temporal?.has_any_temporal_anomaly))}
        ${kvCard("has_any_temporal_block", yesNo(detail.temporal?.has_any_temporal_block))}
        ${kvCard("has_any_temporal_single_point", yesNo(detail.temporal?.has_any_temporal_single_point))}
        ${kvCard("missing_ratio", formatRatio(detail.temporal?.missing_ratio))}
        ${kvCard("missing_count", formatNum(detail.temporal?.missing_count))}
        ${kvCard("backtracking_count", formatNum(detail.temporal?.backtracking_count))}
      </div>
    </section>
    <section class="detail-section">
      <h4>Sampling</h4>
      <div class="kv-grid">
        ${kvCard("has_time_progression", yesNo(detail.sampling?.has_time_progression))}
        ${kvCard("sampling_stability_ratio", formatRatio(detail.sampling?.sampling_stability_ratio))}
        ${kvCard("cluster_count_sorted", formatNum(detail.sampling?.cluster_count_sorted))}
        ${kvCard("max_relative_deviation", formatRatio(detail.sampling?.global_final_max_relative_deviation))}
      </div>
    </section>
    <section class="detail-section">
      <h4>Motion</h4>
      <div class="kv-grid">
        ${kvCard("has_motion_time_context", yesNo(detail.motion?.has_motion_time_context))}
        ${kvCard("invalid_time_ratio", formatRatio(detail.motion?.invalid_time_ratio))}
        ${kvCard("mean_speed_mps", formatFloat(detail.motion?.mean_speed_mps))}
        ${kvCard("max_speed_mps", formatFloat(detail.motion?.max_speed_mps))}
      </div>
    </section>
    <section class="detail-section">
      <h4>Artifacts</h4>
      <div class="artifact-actions">
        <button type="button" id="openInspectorBtn">Open deep inspector</button>
        <button type="button" id="downloadGpxBtn">Download raw GPX</button>
        <button type="button" id="copyAuditPathBtn">Copy audit path</button>
      </div>
    </section>
  `;

  const openInspectorBtn = document.getElementById("openInspectorBtn");
  if (openInspectorBtn) openInspectorBtn.addEventListener("click", () => openInspector());

  const downloadGpxBtn = document.getElementById("downloadGpxBtn");
  if (downloadGpxBtn) downloadGpxBtn.addEventListener("click", () => downloadRawGpx());

  const copyAuditPathBtn = document.getElementById("copyAuditPathBtn");
  if (copyAuditPathBtn) {
    copyAuditPathBtn.addEventListener("click", async () => {
      if (!detail.audit_detail_path) return;
      await navigator.clipboard.writeText(detail.audit_detail_path);
      setStatus("Copied audit path.");
    });
  }
}

async function selectTrack(trackUid) {
  state.selectedTrackUid = trackUid;
  state.loadingDetail = true;
  state.detailError = "";
  renderTable();
  setStatus(`Loading detail for ${trackUid}...`);

  if (detailCache.has(trackUid)) {
    state.selectedDetail = detailCache.get(trackUid);
    state.loadingDetail = false;
    renderDetailPanel();
    setStatus(`Loaded cached detail for ${trackUid}.`);
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
    setStatus(`Loaded detail for ${trackUid}.`);
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

  const typeEntries = [{ value: "all", label: "all anomaly types" }];
  const uniqueTypes = new Set(state.inspectorAnomalies.map((a) => `${a.type}:${a.subtype}`));
  uniqueTypes.forEach((key) => typeEntries.push({ value: key, label: key }));

  typeSelect.innerHTML = "";
  typeEntries.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.value;
    opt.textContent = entry.label;
    typeSelect.appendChild(opt);
  });
  typeSelect.value = state.inspectorFilteredType;

  const filtered = getFilteredInspectorAnomalies();
  summary.textContent = `${filtered.length} anomalies`;

  listEl.innerHTML = "";
  filtered.forEach((entry) => {
    const div = document.createElement("article");
    div.className = "anomaly-item";
    if (entry.globalIdx === state.inspectorSelectedIdx) div.classList.add("selected");
    div.innerHTML = `<strong>${entry.item.label}</strong><div>${entry.item.summary}</div><code>${entry.item.path}</code>`;
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
    setStatus(`Deep inspector loaded (${state.inspectorAnomalies.length} indexed anomalies).`);
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

