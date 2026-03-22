const DEFAULT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  pageSize: 25,
  maxPageSize: 100,
  clientCacheMode: true,
  fetchBatchSize: 1000,
};

function readWindowConfig() {
  if (typeof window === "undefined") return {};
  if (!window.CASE_STUDY_CONFIG || typeof window.CASE_STUDY_CONFIG !== "object") {
    return {};
  }
  return window.CASE_STUDY_CONFIG;
}

export function getCaseStudyConfig() {
  const merged = { ...DEFAULT_CONFIG, ...readWindowConfig() };
  if (!merged.supabaseUrl || !merged.supabaseAnonKey) {
    throw new Error(
      "Missing CASE_STUDY_CONFIG.supabaseUrl or CASE_STUDY_CONFIG.supabaseAnonKey. Configure these in case-study.html."
    );
  }
  return merged;
}

