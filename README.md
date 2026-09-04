# gpx-audit

A deterministic audit layer for GPX tracks. It reports what is actually in a
recording — timestamp anomalies, sampling irregularities, motion inconsistencies
— as structured, schema-versioned JSON. It does not clean, smooth, or correct
anything.

**Workbench:** https://gpx-audit.vercel.app/
**Case-study explorer:** https://gpx-audit-case-study.vercel.app/
**Methodology note:** https://audit-methodology.vercel.app/
**Module spec writeup:** [GPX Audit — pipeline module spec](https://medium.com/@akshmittal/gpx-audit-pipeline-module-spec-technical-writeup-393b3cb7cff5)

**Demo images:**  ![image 1](images/workbench(1).png) ![image 2](images/workbench(2).png)
---

## Why an audit layer exists at all

A GPX file is a recording, and recordings are dirty. Timestamps go missing,
duplicate, or run backwards. Sampling cadence drifts. Segments get stitched
together across clock inconsistencies. Any of that silently distorts downstream
analytics — distance, speed, elevation gain — and the distortion doesn't
announce itself.

The usual response is to clean the data. This pipeline does the opposite first:
it makes the irregularities **explicit and countable**, before anyone decides
what to do about them.

That separation is the whole design. Audit observes. Correction, if it happens,
happens somewhere else, on top of an audit output it can point at.

---

## Pipeline

```
GPX XML → Ingestion → Temporal → Sampling → Motion → unified .audit.v2.json
```

No smoothing, no correction, no trajectory rewriting.

**Design principles**

- Modular stages with explicit boundaries
- Deterministic, schema-first output
- No hidden mutation of the source point stream
- Explainable diagnostics — counts, ratios, events, blocks, singletons
- Explicit index semantics

---

## The modules, and why each boundary sits where it does

### 1. Ingestion — the gate

Parses `wpt`, `rtept`, `trkpt`; validates coordinates; keeps valid points plus
explicit rejection metadata.

**Hard discarding happens here and only here**, and only for invalid
coordinates. Coordinate validity is a structural precondition for every piece of
spatial math downstream, so it's settled once, at the entrance.

Everything after this stays *observational* on the validated stream rather than
re-filtering differently per module. That's what prevents **denominator drift** —
without it, each module reports ratios over a slightly different population and
the numbers stop being comparable.

### 2. Temporal — a label-based view of time

Detects missing, unparsable, duplicate and backtracking timestamps.

**Block rule:** a block is recorded only when a contiguous anomaly run exceeds
length 1. Single-point anomalies are tracked separately and are *never* upcast
into blocks.

The distinction matters because the two carry different operational meaning.
Blocks capture sustained corruption — stitched segments, a clock that died for a
stretch. Singletons capture isolated faults that a block-only summary would
hide. Reporting only blocks gives false reassurance; reporting only counts loses
the severity pattern. So both are kept.

Membership differs by anomaly type:

- **Intrinsic** (missing, unparsable) — point-intrinsic; each anomalous point
  belongs to the run.
- **Comparative** (duplicate, backtracking) — comparator-triggered; the
  reference point is not itself anomalous.
- **Duplicate special case** — an isolated duplicate pair stays a singleton; a
  block needs continuation past the pair.

### 3. Sampling — cadence without verdicts

Characterises sampling behaviour from positive timestamp deltas, using a
**relative** clustering threshold of α = 0.02 (2%).

Relative rather than absolute because a fixed millisecond threshold biases
against long-interval tracks — a 2% tolerance is scale-aware and treats a 1 Hz
recording and a 30-second recording on the same terms.

Two views, because order carries information:

- **Sorted clustering** — global regime count, independent of order
- **Sequential clustering** — order effects and local regime transitions

**Normalization drift** is reported separately, as deviation from a stabilised
cluster centre. Local clustering stays permissive under gradual drift: every
neighbouring pair can pass the 2% test while the track slowly walks away from
where it started. The global centre comparison is what exposes that, and without
it slow regime instability gets under-reported.

### 4. Motion — pair eligibility, not motion physics

Evaluates consecutive pairs that are anchored on valid forward time.

Anchoring keeps missing, unparsable and backward-time segments from
contaminating valid motion totals. Rejected pairs aren't dropped silently —
they're retained as an explicit taxonomy: missing timestamp, unparsable
timestamp, non-finite distance, backward time, zero delta.

**Stated caveat, on purpose:** speed summaries are computed from individually
valid forward pairs. That's a *pair-valid estimator in stream order*, not a
globally clean-continuity estimator. The numbers are observations over valid
local intervals and should not be read as de-corrupted trajectory speed.

---

## Index semantics

All index references are GPX-stream aligned — temporal events and blocks use
GPX-index semantics, pairwise events use `fromIndex` / `toIndex`.

This removes the ambiguity between local array position and original GPX
ordering, and keeps event references stable across module boundaries and
post-processing.

## Cross-module consistency

The modules are independent but their outputs have to agree. These relations
hold by construction and are checkable:

```
temporal.totalPointsChecked      == ingestion.validPointCount
sampling.timestampedPointsCount  <= temporal.validParsedTimestampCount
motion.forwardValidCount         == sampling.positiveTimeDeltasCollected
sampling.nonPositiveTimeDelta.count == motion.backwardCount + motion.zeroTimeDeltaCount
```

They are **consistency relations, not correction rules.** If one breaks, a
module is wrong — the fix is in the module, not in reconciling the numbers.

---

## Validation

**Adversarial suite** — 20 hand-designed GPX fixtures probing edge conditions:
exact 2% clustering boundary, near-boundary float behaviour, a single valid
timestamp, all-identical timestamps, alternating backtracking, large forward
jumps, dateline crossing, polar latitude, mixed point types, timestamp format
variants, backtracking after an invalid gap, 20,000-point scale, multi-`trkseg`
backtrack, static geometry, seeded random walk.

Latest run (2026-03-20, schema v2):

| | |
|---|---|
| Total cases | 20 |
| Strict pass | 18 |
| Expected variance | 2 |
| **Failed** | **0** |

The two expected-variance cases are `adv-01-exact-2pct-boundary` and
`adv-02-near-boundary-float`. Both are marked `EXPECTED_VARIANCE` because
clustering can legitimately remain a single regime under local-centre chaining
at or near a threshold boundary. They are documented as variance rather than
tuned into passing — the behaviour is correct, the strict expectation was too
strict.

Fixtures, expected outcomes and the run report live in
`fixtures/adversarial-custom-test/`. A separate real-world case study covers
prevalence and intensity at dataset scale.

---

## Observation-first outlier policy

This is an audit layer. It reports what exists in the stream; it does not force
interpretation.

- Extreme values are retained as observations
- No automatic "bad data" attribution is made at this stage
- Thresholding and interpretation belong to downstream layers

## Current limitation

Sampling regime detection is implemented for **time-based sampling only**.
Distance-based sampling regime detection is not yet implemented at equivalent
depth.

## Out of scope

Trajectory correction · denoising and smoothing · causal attribution · semantic
activity interpretation.

Anomalies observed here commonly arise from partial or interrupted device
exports, stitched segments with clock inconsistencies, timezone or drift errors,
paused and resumed logging, mixed-source aggregation, and platform timestamp
formatting differences. That list is contextual, **not causal** — the pipeline
does not attribute causes.

---

## Repository

```
js/pipeline/                          pipeline modules
docs/project/                         project + pipeline docs
docs/project/pipeline/                per-module specifications
docs/reports/                         validation and status notes
fixtures/adversarial-custom-test/     20 adversarial GPX cases + EXPECTED/REPORT
```

Start at [`docs/README.md`](docs/README.md), then the
[pipeline technical writeup](docs/project/pipeline/post-1-pipeline-technical-writeup.md)
and the [JSON schema glossary](docs/project/pipeline/json-schema-v2-glossary.md).

Branch ownership and promotion rules: [`BRANCH_POLICY.md`](BRANCH_POLICY.md).
Credential handling: [`SECURITY.md`](SECURITY.md).

**License:** ISC.

---

## Provenance

The architecture, module boundaries, audit semantics, validation strategy and
adversarial test design are mine. Implementation was written with Claude under
my direction and review — I understand and can defend every part of it. The
reasoning in `docs/` is mine.

---

## Glossary

- **Backtracking timestamp** — current valid timestamp is below the monotonic
  temporal anchor
- **Duplicate timestamp** — current valid timestamp equals the previous valid one
- **Block anomaly** — contiguous anomaly run of length > 1
- **Single-point anomaly** — anomaly event belonging to no block
- **Sorted / sequential clustering** — clustering after sorting deltas, vs in
  original order
- **Normalization drift** — final deviation from stabilised cluster-centre
  reference metrics
- **Pair-valid estimator** — metric computed from individually valid pairs
  without requiring global continuity
