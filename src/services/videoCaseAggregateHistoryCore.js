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
  const snapshot = aggregate?.source_snapshot && typeof aggregate.source_snapshot === "object"
    ? aggregate.source_snapshot
    : {};
  const caseTitle = cleanText(snapshot.case_title, "");

  return {
    aggregateId,
    shortAggregateId: aggregateId.slice(0, 8) || "-",
    fileName: caseTitle
      ? `${caseTitle} - รายงานสรุปผลการประเมิน.pdf`
      : `รายงานสรุปผลการประเมิน-${aggregateId.slice(0, 8) || "-"}.pdf`,
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
