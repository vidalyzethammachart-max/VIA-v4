type Translate = (key: string, vars?: Record<string, string | number>) => string;

// Supabase returns plain PostgREST error objects, not Error instances, so callers
// that test `instanceof Error` always fall back to a generic message. Map the
// codes we can explain and keep the original detail for everything else.
export function describeEvaluationDeleteError(error: unknown, t: Translate): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : error instanceof Error ? error.message : "";

  // video_case_aggregate_sources.evaluation_id references evaluations ON DELETE RESTRICT.
  if (code === "23503") return t("myForms.deleteInUse");
  // RLS filtered the row out, so `.single()` found nothing to delete.
  if (code === "PGRST116" || code === "42501") return t("myForms.deleteNotAllowed");
  return message ? `${t("myForms.deleteFailed")} (${message})` : t("myForms.deleteFailed");
}

// True when a combined video case summary still uses the evaluation, so the user must remove
// that summary first and the page should send them to the case instead of just showing text.
export function isEvaluationInUseError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && String((error as { code?: unknown }).code ?? "") === "23503";
}
