// Deleting an evaluation. Who may delete is decided by RLS on public.evaluations
// (owner, or case leader/admin for evaluations that belong to a case), so the
// query must not add its own user_id filter: that would stop an admin from
// deleting somebody else's form even though the policy allows it.

export class EvaluationDeleteError extends Error {
  /** @param {"in_use" | "not_allowed" | "failed"} code */
  constructor(code, message) {
    super(message);
    this.name = "EvaluationDeleteError";
    this.code = code;
  }
}

export async function deleteEvaluationById(client, id) {
  const { data, error } = await client
    .from("evaluations")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    // 23503: a combined summary or group still references this evaluation (ON DELETE RESTRICT).
    if (error.code === "23503") throw new EvaluationDeleteError("in_use", error.message);
    throw new EvaluationDeleteError("failed", error.message);
  }

  // RLS hides rows the caller may not delete, so "no row" means not allowed (or already gone).
  if (!data) throw new EvaluationDeleteError("not_allowed", "No evaluation was deleted.");
}
