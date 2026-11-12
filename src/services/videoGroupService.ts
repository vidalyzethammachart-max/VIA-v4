import { combineAggregateStatistics } from "./aggregateStatistics.js";
import { COMBINE_MIN_MESSAGE, MIN_COMBINE_COUNT, toCombineSourceRuns } from "./videoCaseCombineSelectionCore.js";
import { supabase } from "../lib/supabaseClient";
import { getCurrentUserEmployeeNumber, type VideoCaseEvaluationRow } from "./videoCaseService";
import { buildVideoGroupDisplayName } from "./videoGroupCore.js";
import { buildVideoGroupSummaryPayload } from "./videoGroupPayloadCore.js";

export type VideoGroupType = "group" | "round" | "year_end";

export type VideoGroupRow = {
  id: string;
  order_number: string;
  group_type: VideoGroupType;
  subject_name: string;
  requested_by: string;
  requested_by_name: string | null;
  requested_by_employee_number: string | null;
  source_snapshot: Record<string, unknown>;
  combined_scores: Record<string, unknown>;
  section_averages: Record<string, unknown>;
  source_count: number;
  ai_model: string | null;
  ai_output: Record<string, unknown> | null;
  ai_raw_text: string | null;
  status: "pending" | "ready" | "failed";
  error: string | null;
  document_status: "draft" | "pending" | "ready" | "failed";
  document_error: string | null;
  source_doc_id: string | null;
  pdf_storage_path: string | null;
  docx_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

export type SelectableEvaluationRow = VideoCaseEvaluationRow & {
  video_cases: { case_key: string; case_title: string | null; deleted_at?: string | null } | null;
};

const DUPLICATE_GROUP_MESSAGE = "มีแบบประเมินกลุ่มนี้อยู่แล้ว (เลขที่สั่งงาน ประเภท และชื่อหัวข้อซ้ำกัน)";

export async function getSelectableEvaluations(): Promise<SelectableEvaluationRow[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select(
      "id, user_id, created_by, employee_number, video_case_id, analysis_kind, order_number, subject_name, overall_suggestion, rubric, analysis_ai_model, analysis_ai_output, analysis_ai_raw_text, pdf_storage_path, docx_storage_path, document_status, document_error, created_at, video_cases!inner(case_key, case_title, deleted_at)",
    )
    .eq("document_status", "ready")
    .not("video_case_id", "is", null)
    // The inner embed is RLS-filtered, so evaluations of cases the user cannot see are dropped
    // server-side; trashed cases are excluded the same way.
    .is("video_cases.deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  // Defensive: never offer a row whose case is hidden (null embed) or trashed.
  return ((data ?? []) as unknown as SelectableEvaluationRow[]).filter(
    (row) => row.video_cases != null && !row.video_cases.deleted_at,
  );
}

export async function createVideoGroupEvaluation(params: {
  orderNumber: string;
  groupType: VideoGroupType;
  subjectName: string;
  sourceRuns: SelectableEvaluationRow[];
}): Promise<VideoGroupRow> {
  const distinct = new Set(params.sourceRuns.map((run) => run.id));
  if (distinct.size < MIN_COMBINE_COUNT) throw new Error(COMBINE_MIN_MESSAGE);

  const combineRuns = toCombineSourceRuns(params.sourceRuns);
  const stats = combineAggregateStatistics(combineRuns);
  const displayName = buildVideoGroupDisplayName(params.groupType, params.subjectName);

  const { data, error } = await supabase.rpc("create_video_group_evaluation", {
    p_order_number: params.orderNumber,
    p_group_type: params.groupType,
    p_subject_name: params.subjectName,
    p_evaluation_ids: params.sourceRuns.map((run) => run.id),
    p_source_snapshot: {
      case_title: displayName,
      source_runs: combineRuns,
      question_averages_by_section: stats.aggregatedScores,
      question_averages: stats.aggregatedScores,
      section_averages: stats.sectionAverages,
      matrix_averages: stats.aggregatedMatrix,
    },
    p_combined_scores: stats.aggregatedScores,
    p_section_averages: stats.sectionAverages,
  });

  if (error) {
    if (error.code === "23505" && /video_group_evaluations_identity_idx/.test(error.message ?? "")) {
      throw new Error(DUPLICATE_GROUP_MESSAGE);
    }
    throw new Error(error.message);
  }

  return data as VideoGroupRow;
}

export async function getVideoGroups(): Promise<VideoGroupRow[]> {
  const { data, error } = await supabase
    .from("video_group_evaluations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VideoGroupRow[];
}

export async function getVideoGroup(id: string): Promise<VideoGroupRow | null> {
  const { data, error } = await supabase
    .from("video_group_evaluations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as VideoGroupRow | null) ?? null;
}

export async function getVideoGroupSources(
  id: string,
): Promise<Array<{ evaluation_id: number; video_case_id: string; source_position: number }>> {
  const { data, error } = await supabase
    .from("video_group_evaluation_sources")
    .select("evaluation_id, video_case_id, source_position")
    .eq("group_id", id)
    .order("source_position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Array<{ evaluation_id: number; video_case_id: string; source_position: number }>;
}

export async function getVideoGroupDocumentUrls(id: string): Promise<{
  pdfUrl: string | null;
  docxUrl: string | null;
}> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    pdfUrl: string | null;
    docxUrl: string | null;
    error?: string;
  }>("document-artifact-url", {
    body: { aggregateId: id },
  });

  if (error || !data?.ok) {
    throw new Error(error?.message || data?.error || "Group document is not ready.");
  }

  return { pdfUrl: data.pdfUrl, docxUrl: data.docxUrl };
}

export async function sendVideoGroupToN8n(
  id: string,
  combinePrompt: string | null,
): Promise<VideoGroupRow> {
  const group = await getVideoGroup(id);
  if (!group) {
    throw new Error("Group not found.");
  }

  if (group.document_status === "ready") return group;

  const requestedByEmployeeNumber = await getCurrentUserEmployeeNumber();
  const sources = await getVideoGroupSources(group.id);
  const prompt = typeof combinePrompt === "string" ? combinePrompt.trim() || null : null;
  const summary = buildVideoGroupSummaryPayload({
    group: { ...group, sources },
    requestedByEmployeeNumber,
    combinePrompt: prompt,
  });

  // The server atomically owns dispatch/pending state and duplicate prevention.
  const { data: documentData, error: documentError } = await supabase.functions.invoke("forward-to-n8n", {
    body: summary,
  });

  // A callback can arrive even when the browser loses the delivery response.
  const latestGroup = await getVideoGroup(group.id);
  if (latestGroup?.document_status === "ready") return latestGroup;
  if (documentError || !documentData?.ok) {
    throw new Error(documentData?.error || documentError?.message || "Failed to start group document generation. Inspect its status before resubmitting.");
  }
  if (!latestGroup) {
    throw new Error("Group disappeared after document dispatch.");
  }
  return latestGroup;
}

// UX only: whether to show the "create" link. The RPC and RLS stay the authority.
export async function isLeaderOfAnyVideoCase(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("video_case_members")
    .select("video_case_id")
    .eq("user_id", userId)
    .eq("member_role", "leader")
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).length > 0;
}
