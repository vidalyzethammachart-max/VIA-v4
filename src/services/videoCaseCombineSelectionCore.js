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
