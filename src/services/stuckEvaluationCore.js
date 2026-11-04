// Same 30-minute limit as the Analyze Video timeout and list_stuck_evaluations().
export const STUCK_EVALUATION_MS = 30 * 60 * 1000;

export function isEvaluationStuck(run, nowMs = Date.now()) {
  if (run?.document_status !== "pending") return false;
  const started = Date.parse(run.created_at);
  return Number.isFinite(started) && nowMs - started >= STUCK_EVALUATION_MS;
}
