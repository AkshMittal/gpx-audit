function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function addTemporalAnomalies(auditJson, out) {
  const temporalOrder = auditJson?.audit?.temporal?.temporalOrder || {};
  const groups = ["missing", "unparsable", "duplicate", "backtracking"];

  for (const group of groups) {
    const groupObj = temporalOrder[group] || {};
    const blocks = asArray(groupObj.blocks);
    const singles = asArray(groupObj.singlePoints);

    blocks.forEach((block, idx) => {
      const fromIndex = block?.fromIndex ?? block?.startIndex ?? null;
      const toIndex = block?.toIndex ?? block?.endIndex ?? null;
      const length = block?.length ?? (fromIndex !== null && toIndex !== null ? toIndex - fromIndex + 1 : null);
      out.push({
        type: "temporal",
        subtype: group,
        kind: "block",
        label: `${group}.blocks[${idx}]`,
        path: `audit.temporal.temporalOrder.${group}.blocks[${idx}]`,
        summary: `len=${length ?? "?"}, from=${fromIndex ?? "?"}, to=${toIndex ?? "?"}`,
        highlightTerm: `"${group}"`,
      });
    });

    singles.forEach((single, idx) => {
      const gpxIndex = single?.gpxIndex ?? single?.index ?? single;
      out.push({
        type: "temporal",
        subtype: group,
        kind: "single",
        label: `${group}.singlePoints[${idx}]`,
        path: `audit.temporal.temporalOrder.${group}.singlePoints[${idx}]`,
        summary: `gpxIndex=${gpxIndex ?? "?"}`,
        highlightTerm: `"${group}"`,
      });
    });
  }
}

function addSamplingAnomalies(auditJson, out) {
  const clustering = auditJson?.audit?.sampling?.time?.clustering || {};
  const candidates = [
    { key: "clustersSorted", title: "clustersSorted" },
    { key: "clustersSequential", title: "clustersSequential" },
    { key: "clusters", title: "clusters" },
  ];

  for (const candidate of candidates) {
    const clusters = asArray(clustering[candidate.key]);
    if (!clusters.length) continue;
    clusters.forEach((cluster, idx) => {
      const count =
        cluster?.count ??
        cluster?.membersCount ??
        (Array.isArray(cluster?.members) ? cluster.members.length : null);
      const valueMs = cluster?.valueMs ?? cluster?.centroidMs ?? cluster?.value;
      out.push({
        type: "sampling",
        subtype: "clustering",
        kind: "cluster",
        label: `${candidate.title}[${idx}]`,
        path: `audit.sampling.time.clustering.${candidate.key}[${idx}]`,
        summary: `valueMs=${valueMs ?? "?"}, count=${count ?? "?"}`,
        highlightTerm: `"${candidate.key}"`,
      });
    });
  }
}

export function buildAnomalyIndex(auditJson) {
  const out = [];
  addTemporalAnomalies(auditJson, out);
  addSamplingAnomalies(auditJson, out);
  return out;
}

export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function highlightFirstMatch(rawJsonText, term) {
  const escaped = escapeHtml(rawJsonText);
  if (!term) return escaped;

  const escapedTerm = escapeHtml(term);
  const idx = escaped.indexOf(escapedTerm);
  if (idx < 0) return escaped;

  return (
    escaped.slice(0, idx) +
    `<mark class="json-highlight">${escaped.slice(idx, idx + escapedTerm.length)}</mark>` +
    escaped.slice(idx + escapedTerm.length)
  );
}

export function groupAnomalies(anomalies, selectedType) {
  if (!selectedType || selectedType === "all") return anomalies;
  return anomalies.filter((item) => `${item.type}:${item.subtype}` === selectedType);
}

