# Product Roadmap: Mountain GPX Intelligence

## Working Vision

Build a SaaS for trekkers and climbers that turns uploaded GPX tracks into transparent, mountain-specific analytics.

Core thesis:
- mainstream tools are optimized for general fitness use cases
- mountain terrain needs different assumptions, methods, and controls
- analytics are only useful if data quality and computation trust are explicit

---

## Product Principles (Non-Negotiable)

### 1) Honesty-first computation
- If a section is unreliable for a metric, mark it and exclude it.
- Never silently smooth/repair and present output as raw truth.
- Every metric should expose quality context (coverage, exclusions, reason tags).

### 2) Advanced user control
- Keep sensible defaults for most users.
- Provide expert controls for users who need terrain-aware tuning.
- Example: steepest-section window must be configurable (e.g., 50m, 100m, 250m, 1km), not hard-bound.

### 3) Methodology visibility
- Users should know what was computed, how, and on what valid subset.
- Keep algorithm notes and assumptions linked in-product.

---

## Current State

Implemented:
- GPX ingestion and structural validation
- Temporal audit (missing/unparsable/duplicate/backtracking)
- Sampling audit (2% relative clustering + drift diagnostics)
- Motion audit (anchored pair-valid metrics)
- Unified JSON export contract
- Frontend inspection workbench + visualization notes/methodology links
- 12k-scale case study execution pipeline and reporting scripts

Positioning:
- Current system is an observation and audit layer, not a correction engine.

---

## Roadmap Phases

## Phase 0 (Now): Freeze and Evidence
- Stabilize audit contract and indexing semantics.
- Keep adversarial validation suite passing.
- Regenerate 12k outputs with finalized schema.
- Publish concise pipeline communication assets.

Exit criteria:
- consistent schema
- deterministic reruns
- no ambiguity between block and single-point anomaly views

## Phase 1: Queryable Case Study Platform
- Load case-study outputs into a queryable database.
- Build controlled query API + frontend explorer.
- Surface dataset-level anomaly prevalence/intensity in interactive form.

Minimum deliverables:
- filterable track list
- per-track audit detail view
- block/single-point anomaly inspection
- export of filtered query results

## Phase 2: Processing Layer (Explicit, Not Silent)
- Add optional processing profiles after audit.
- Processing must be user-visible, versioned, and reversible.
- Keep raw vs processed comparison available.

Examples:
- smoothing profile with explicit parameters
- outlier handling policy
- section-level exclusion policy by metric

## Phase 3: Mountain-specific Metric Engine
- Introduce terrain-aware and windowed metrics.
- Use rolling windows, not coarse fixed buckets.
- Return metric + quality metadata together.

Examples:
- steepest section for configurable window length
- sustained grade effort windows
- ascent/descent segmentation quality-aware stats

## Phase 4: Community + Comparative Analysis
- Shareable route analytics views
- peer comparison on normalized mountain metrics
- route/segment discovery using quality-filtered data

---

## Metric Contract Direction (Draft)

Every metric should return:
- `value`
- `qualityLevel` (`high` / `caution` / `invalid`)
- `coverageRatio`
- `excludedSegmentsCount`
- `exclusionReasons[]`
- `parametersUsed`

This keeps outputs trustworthy and interpretable.

---

## Immediate Next Actions

1) Complete fresh 12k rerun on finalized schema.
2) Set up DB-backed case-study explorer (Phase 1 MVP).
3) Define first metric spec in full detail (suggested: `steepestWindow`).
4) Write short product vision note from this roadmap for internship use.

---

## Open Notes / Backlog Seeds

- Elevation should be integrated in relevant downstream metrics.
- Investigate patterns inside backtracking blocks (e.g., linear regression vs stitched anomaly signatures).
