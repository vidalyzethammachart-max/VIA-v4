import { supabase } from "../lib/supabaseClient";
import { findSupersededIds } from "./evaluationSupersedeCore.js";

export type StuckEvaluationRow = {
  evaluation_id: number;
  order_number: string | null;
  subject_name: string | null;
  user_id: string | null;
  owner_email: string | null;
  document_status: string;
  document_error: string | null;
  created_at: string;
  report_id: string | null;
  reported_at: string | null;
  report_note: string | null;
  failure_execution_id: number | null;
  failure_http_status: number | null;
  failure_node: string | null;
  retry_claimed_at: string | null;
  retry_execution_id: number | null;
  retry_error: string | null;
};

export async function reportStuckEvaluation(evaluationId: number, note?: string): Promise<void> {
  const { error } = await supabase.rpc("report_stuck_evaluation", {
    p_evaluation_id: evaluationId,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function getStuckEvaluationReport(evaluationId: number): Promise<{ reported: boolean; reported_at: string | null }> {
  const { data, error } = await supabase.rpc("get_evaluation_stuck_report", { p_evaluation_id: evaluationId });
  if (error) throw new Error(error.message);
  return data as { reported: boolean; reported_at: string | null };
}

type CaseCopy = { id: number; user_id: string | null; video_case_id: string | null; document_status: string; created_at: string };

export async function listStuckEvaluations(): Promise<StuckEvaluationRow[]> {
  const { data, error } = await supabase.rpc("list_stuck_evaluations_v2");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as StuckEvaluationRow[];
  if (rows.length === 0) return rows;

  // Hide stuck copies of a case the same user resubmitted: the ready copy, or the
  // newest unfinished one, stands for that case, as on my-forms.
  const listed = await supabase
    .from("evaluations")
    .select("id, user_id, video_case_id, document_status, created_at")
    .in("id", rows.map((row) => row.evaluation_id));
  if (listed.error) throw new Error(listed.error.message);
  const caseIds = [...new Set((listed.data ?? []).map((row) => row.video_case_id).filter(Boolean))] as string[];
  if (caseIds.length === 0) return rows;
  const copies = await supabase
    .from("evaluations")
    .select("id, user_id, video_case_id, document_status, created_at")
    .in("video_case_id", caseIds);
  if (copies.error) throw new Error(copies.error.message);
  const hidden = findSupersededIds((copies.data ?? []) as CaseCopy[]);
  return rows.filter((row) => !hidden.has(row.evaluation_id));
}

export async function resolveStuckEvaluationReport(evaluationId: number): Promise<void> {
  const { error } = await supabase.rpc("resolve_stuck_evaluation_report", { p_evaluation_id: evaluationId });
  if (error) throw new Error(error.message);
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const context = typeof error === "object" && error !== null ? Reflect.get(error, "context") : null;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.error === "string" && payload.error) return payload.error;
    } catch {
      // Fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : "Retry failed.";
}

// Admin only: rerun a quota-failed n8n execution. The function finds the failed
// execution itself when n8n never reported it back.
export async function retryEvaluationExecution(evaluationId: number): Promise<number | null> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; retry_execution_id?: number | null; error?: string }>(
    "retry-n8n-execution",
    { body: { evaluation_id: evaluationId } },
  );
  if (error) throw new Error(await functionErrorMessage(error));
  if (!data?.ok) throw new Error(data?.error || "Retry failed.");
  return data.retry_execution_id ?? null;
}
