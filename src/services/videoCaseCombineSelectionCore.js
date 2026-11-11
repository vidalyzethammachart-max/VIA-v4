import { getAnalysisMatrix } from "./aggregateStatistics.js";

// An evaluation is combinable only after its own analysis and document finished.
// Pending rows may still be waiting on video analysis; failed rows have no trusted result.
export function isCombinableEvaluation(run) {
  return run?.document_status === "ready";
}

export function getCombinableEvaluationIds(runs) {
  return runs.filter(isCombinableEvaluation).map((run) => run.id);
}

export function keepCombinableSelection(runs, selectedIds) {
  const combinable = new Set(getCombinableEvaluationIds(runs));
  return selectedIds.filter((id) => combinable.has(id));
}

// A group evaluation needs at least two evaluations to combine.
export const MIN_COMBINE_COUNT = 2;
export const COMBINE_MIN_MESSAGE = "เลือกแบบประเมินที่พร้อมใช้งานอย่างน้อย 2 รายการจึงจะรวมผลได้";

// Returns null when the selection can be combined, otherwise the reason it cannot.
export function getCombineBlockReason(runs, selectedIds) {
  const usable = new Set(keepCombinableSelection(runs, selectedIds));
  return usable.size >= MIN_COMBINE_COUNT ? null : COMBINE_MIN_MESSAGE;
}

// Shape of one evaluation as the combine step consumes it.
export function toCombineSourceRuns(runs) {
  return runs.map((run) => ({
    id: run.id,
    user_id: run.user_id,
    employee_number: run.employee_number,
    evaluation_id: run.id,
    run_kind: run.analysis_kind,
    rubric: run.rubric,
    matrix: getAnalysisMatrix(run.analysis_ai_output),
    ai_output: run.analysis_ai_output,
    ai_raw_text: run.analysis_ai_raw_text,
    notes: run.overall_suggestion,
    created_at: run.created_at,
    order_number: run.order_number,
  }));
}
