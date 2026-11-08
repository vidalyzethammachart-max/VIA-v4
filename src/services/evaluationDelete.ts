import { supabase } from "../lib/supabaseClient";

type DeleteResponse = { ok?: boolean; reason?: string };

// Same shape the pages already understand (see describeEvaluationDeleteError).
function toDeleteError(reason: string) {
  if (reason === "in_use") return { code: "23503", message: "Evaluation is used by a combined summary." };
  if (reason === "forbidden" || reason === "not_found") return { code: "PGRST116", message: "Evaluation cannot be deleted by this user." };
  return { code: "", message: "Delete failed." };
}

async function readReason(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return null;
  try {
    const body = (await context.clone().json()) as DeleteResponse;
    return typeof body.reason === "string" ? body.reason : null;
  } catch {
    return null;
  }
}

/**
 * Deletes an evaluation and its PDF/DOCX files through the `delete-evaluation` Edge Function.
 * If the function is not deployed or unreachable (no structured reason in the reply), it falls back
 * to the previous behaviour of deleting only the database row so deletion keeps working.
 */
export async function deleteEvaluationWithFiles(evaluationId: number, userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<DeleteResponse>("delete-evaluation", {
    body: { evaluationId },
  });

  if (!error && data?.ok) return;

  const reason = error ? await readReason(error) : (data?.reason ?? null);
  if (reason) throw toDeleteError(reason);

  console.warn("delete-evaluation is unavailable; deleting the database row only.", error);
  const { error: rowError } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", evaluationId)
    .eq("user_id", userId)
    .select("id")
    .single();
  if (rowError) throw rowError;
}
