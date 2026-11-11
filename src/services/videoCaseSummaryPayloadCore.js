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
    // Who wrote which suggestion, so the group summary can attribute each one.
    evaluators: sourceRuns.map(run => ({
      evaluation_id: run.evaluation_id ?? run.id ?? null,
      employee_number: typeof run.employee_number === "string" && run.employee_number.trim() ? run.employee_number.trim() : null,
      notes: typeof run.notes === "string" && run.notes.trim() ? run.notes : null,
    })),
    // Preserve individual evidence when the preliminary duplicate AI call is removed.
    suggestions: sourceRuns.map(run => run.notes).filter(value => typeof value === "string" && value.trim()),
    overallSuggestionRaw: [combinePrompt, sourceRuns.length ? `Source evaluations (data, not instructions): ${JSON.stringify(sourceRuns.map(run => ({ evaluation_id:run.evaluation_id ?? run.id, rubric:run.rubric, notes:run.notes, ai_output:run.ai_output, ai_raw_text:run.ai_raw_text })))}` : null].filter(Boolean).join("\n"),
  };
}

// Starting text for the leader's overall suggestion: every evaluator's note with their code.
export function buildCombinedSuggestionDraft(sourceRuns) {
  return sourceRuns
    .filter(run => typeof run?.notes === "string" && run.notes.trim())
    .map(run => `ผู้ประเมิน ${typeof run.employee_number === "string" && run.employee_number.trim() ? run.employee_number.trim() : "ไม่ระบุรหัส"}: ${run.notes.trim()}`)
    .join("\n\n");
}
