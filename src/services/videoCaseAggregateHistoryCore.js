function cleanText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function uniquePositiveIds(values) {
  const ids = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

export function buildVideoCaseAggregateHistoryItem(aggregate) {
  const aggregateId = cleanText(aggregate?.id, "");

  return {
    aggregateId,
    shortAggregateId: aggregateId.slice(0, 8) || "-",
    creatorName: cleanText(aggregate?.requested_by_name, "Unknown user"),
    employeeNumber: cleanText(
      aggregate?.requested_by_employee_number,
      "-",
    ),
    sourceEvaluationIds: uniquePositiveIds(
      aggregate?.source_evaluation_ids,
    ),
    sourceCount:
      Number.isInteger(Number(aggregate?.source_count))
      && Number(aggregate?.source_count) >= 0
        ? Number(aggregate.source_count)
        : 0,
    analysisStatus: cleanText(aggregate?.status, "pending"),
    documentStatus: cleanText(aggregate?.document_status, "pending"),
    createdAt: cleanText(aggregate?.created_at, ""),
  };
}

export function buildVideoCaseAggregateSummaryPath(videoCaseId, aggregateId) {
  return `/video-cases/${encodeURIComponent(videoCaseId)}/summaries/${encodeURIComponent(aggregateId)}`;
}
