export function buildVideoCaseSummaryPayload({
  aggregate,
  requestedByEmployeeNumber,
  combinePrompt,
}) {
  const snapshot = aggregate.source_snapshot || {};
  const sourceRuns = Array.isArray(snapshot.source_runs) ? snapshot.source_runs : [];
  const firstSource = sourceRuns.find((run) => run && typeof run === "object") || {};
  const caseTitle = typeof snapshot.case_title === "string" ? snapshot.case_title : null;
  const orderNumber =
    typeof firstSource.order_number === "string" && firstSource.order_number.trim()
      ? firstSource.order_number.trim()
      : null;

  return {
    document_type: "video_case_summary",
    aggregate_id: aggregate.id,
    video_case_id: aggregate.video_case_id,
    case_title: caseTitle,
    subject_name: caseTitle ? `${caseTitle} - Aggregate Report` : "Aggregate Report",
    order_number: orderNumber,
    sender_employee_number: requestedByEmployeeNumber,
    source_evaluation_ids: aggregate.source_evaluation_ids,
    source_count: aggregate.source_count,
    question_averages: aggregate.combined_scores,
    section_averages: aggregate.section_averages || null,
    aggregate_analysis: aggregate.ai_output || aggregate.ai_raw_text,
    combine_prompt: combinePrompt,
  };
}
