export const PRESETS = ["overview", "temporal", "sampling", "motion"];

export const INITIAL_FILTERS = {
  sourceDataset: "",
  trackUidContains: "",

  validPointMin: "",
  validPointMax: "",
  rejectedPointMin: "",
  rejectedPointMax: "",

  hasAnyTemporalAnomaly: "any",
  hasAnyTemporalBlock: "any",
  hasAnyTemporalSinglePoint: "any",
  missingRatioMin: "",
  missingRatioMax: "",
  backtrackingCountMin: "",

  hasTimeProgression: "any",
  samplingStabilityRatioMin: "",
  samplingStabilityRatioMax: "",
  clusterCountSortedMin: "",

  hasMotionTimeContext: "any",
  invalidTimeRatioMin: "",
  invalidTimeRatioMax: "",
};

export function createInitialState(config) {
  return {
    config,
    selectedPreset: "overview",
    page: 1,
    pageSize: config.pageSize,
    totalCount: 0,
    sort: {
      field: "track_uid",
      direction: "asc",
    },
    filters: { ...INITIAL_FILTERS },
    activeCategory: "dataset",

    loadingList: false,
    listError: "",
    rows: [],

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
  state.page = 1;
}

export function countActiveFilters(filters) {
  return Object.values(filters).filter((value) => value !== "" && value !== "any").length;
}

