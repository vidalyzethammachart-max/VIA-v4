import { supabase } from "../lib/supabaseClient";

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

export async function listStuckEvaluations(): Promise<StuckEvaluationRow[]> {
  const { data, error } = await supabase.rpc("list_stuck_evaluations");
  if (error) throw new Error(error.message);
  return (data ?? []) as StuckEvaluationRow[];
}

export async function resolveStuckEvaluationReport(evaluationId: number): Promise<void> {
  const { error } = await supabase.rpc("resolve_stuck_evaluation_report", { p_evaluation_id: evaluationId });
  if (error) throw new Error(error.message);
}
