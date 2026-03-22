export const PRESETS = [
  "tracks",
  "ingestion_metrics",
  "temporal_metrics",
  "sampling_metrics",
  "motion_metrics",
];

export const INITIAL_FILTERS = {
  trackUidContains: "",
  sourceFileNameContains: "",
  schemaVersion: "",
  /** "any" | "hikr_12k" | "custom-test" */
  dataSource: "any",

  summaryTotalPointMin: "",
  summaryTotalPointMax: "",
  ingestionValidPointMin: "",
  ingestionValidPointMax: "",
  ingestionRejectedPointMin: "",
  ingestionRejectedPointMax: "",
  hasAnyTimestampValues: "any",

  missingRatioMin: "",
  missingRatioMax: "",
  unparsableRatioMin: "",
  unparsableRatioMax: "",
  duplicateRatioMin: "",
  duplicateRatioMax: "",
  backtrackingPointCountMin: "",

  hasAnyPositiveTimeDelta: "any",
  sequentialOverSortedClusterRatioMin: "",
  sequentialOverSortedClusterRatioMax: "",
  sortedClusterCountMin: "",

  invalidTimeShareMin: "",
  invalidTimeShareMax: "",
  forwardValidPairCountMin: "",
};

export function createInitialState(config) {
  return {
    config,
    selectedPreset: "tracks",
    page: 1,
    pageSize: config.pageSize,
    totalCount: 0,
    sort: {
      field: "id",
      direction: "asc",
    },
    filters: { ...INITIAL_FILTERS },
    /** Snapshot used for chips + list filtering; updated on Apply (and chip-remove / reset). */
    appliedFilters: { ...INITIAL_FILTERS },
    activeCategory: "identity",

    loadingList: false,
    listError: "",
    rows: [],
    allRows: [],
    cacheLoaded: false,

    selectedTrackUid: "",
    selectedDetail: null,
    loadingDetail: false,
    detailError: "",

    inspectorOpen: false,
    inspectorLoading: false,
    inspectorError: "",
    inspectorRawJson: "",
    inspectorAnomalies: [],
    inspectorFilteredType: "all",
    inspectorSelectedIdx: -1,
  };
}

export function resetFilters(state) {
  state.filters = { ...INITIAL_FILTERS };
  state.appliedFilters = { ...INITIAL_FILTERS };
  state.page = 1;
}

export function countActiveFilters(filters) {
  return Object.values(filters).filter((value) => value !== "" && value !== "any").length;
}

