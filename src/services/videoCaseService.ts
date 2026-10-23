import { combineAggregateStatistics } from "./aggregateStatistics.js";
import { supabase } from "../lib/supabaseClient";
import { normalizeRole } from "../lib/roles";
import { buildVideoCaseSummaryPayload } from "./videoCaseSummaryPayloadCore.js";
import { resolveAggregateSourceIds } from "./videoCaseSourceIds.js";

export { buildVideoCaseSummaryPayload } from "./videoCaseSummaryPayloadCore.js";
export { resolveAggregateSourceIds } from "./videoCaseSourceIds.js";

export type VideoCaseMemberRole = "member" | "leader";
export type VideoCaseAggregateStatus = "pending" | "ready" | "failed";

export type VideoCaseRow = {
  id: string;
  case_key: string;
  case_title: string;
  description?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  source_file_name: string | null;
  video_object_key: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type VideoCaseMemberRow = {
  id: string;
  video_case_id: string;
  user_id: string;
  member_role: VideoCaseMemberRole;
  created_at: string;
};

export type VideoCaseAggregateRow = {
  id: string;
  video_case_id: string;
  requested_by: string;
  requested_by_name: string | null;
  requested_by_employee_number: string | null;
  source_evaluation_ids: number[];
  source_count: number;
  source_snapshot: Record<string, unknown>;
  combined_scores: Record<string, unknown>;
  section_averages?: Record<string, unknown>;
  ai_model: string | null;
  ai_output: Record<string, unknown> | null;
  ai_raw_text: string | null;
  status: VideoCaseAggregateStatus;
  error: string | null;
  document_status: "pending" | "ready" | "failed";
  document_error: string | null;
  source_doc_id: string | null;
  pdf_storage_path: string | null;
  docx_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoCaseEvaluationRow = {
  id: number;
  user_id: string | null;
  created_by: string | null;
  employee_number: string | null;
  video_case_id: string | null;
  analysis_kind: "human" | "aggregate";
  order_number: string | null;
  subject_name: string | null;
  overall_suggestion: string | null;
  rubric: Record<string, unknown>;
  analysis_ai_model: string | null;
  analysis_ai_output: Record<string, unknown> | null;
  analysis_ai_raw_text: string | null;
  pdf_storage_path: string | null;
  docx_storage_path: string | null;
  document_status: "pending" | "ready" | "failed";
  document_error: string | null;
  created_at: string;
};

async function getCurrentUserEmployeeNumber(): Promise<string | null> {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error("Authentication required.");
  }

  const { data, error } = await supabase
    .from("user_information")
    .select("employee_number")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.employee_number === "string" && data.employee_number.trim()
    ? data.employee_number.trim()
    : null;
}

export async function resolveVideoCaseMembership(
  options?: {
    orderNumber?: string;
    subjectName?: string;
    videoCaseId?: string;
    caseKey?: string;
    caseTitle?: string;
    sourceFileName?: string | null;
    videoObjectKey?: string | null;
    memberRole?: VideoCaseMemberRole;
  },
): Promise<VideoCaseRow> {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error("Authentication required.");
  }

  const byIdentity = Boolean(options?.orderNumber && options?.subjectName);
  const rpcArgs = byIdentity
    ? {
        p_order_number: options?.orderNumber,
        p_subject_name: options?.subjectName,
        p_video_case_id: options?.videoCaseId ?? null,
        p_case_title: options?.caseTitle ?? null,
        p_source_file_name: options?.sourceFileName ?? null,
        p_video_object_key: options?.videoObjectKey ?? null,
        p_member_role: options?.memberRole ?? "member",
      }
    : {
        p_case_key: options?.caseKey ?? "",
        p_case_title: options?.caseTitle ?? null,
        p_source_file_name: options?.sourceFileName ?? null,
        p_video_object_key: options?.videoObjectKey ?? null,
        p_member_role: options?.memberRole ?? "member",
      };

  const { data, error } = await supabase.rpc(byIdentity ? "resolve_video_case_by_identity" : "resolve_video_case_membership", rpcArgs);

  if (error) {
    throw new Error(error.message);
  }

  return data as VideoCaseRow;
}

export async function setVideoCaseTrashed(id: string, trashed: boolean): Promise<VideoCaseRow> {
  const { data, error } = await supabase.rpc("set_video_case_trashed", {
    p_video_case_id: id, p_trashed: trashed,
  });
  if (error) throw new Error(error.message);
  return data as VideoCaseRow;
}

export async function getMyVideoCases(options?: { trashed?: boolean }): Promise<VideoCaseRow[]> {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error("Authentication required.");
  }

  const { data: roleData, error: roleError } = await supabase
    .from("user_information")
    .select("role")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (roleError) {
    throw new Error(roleError.message);
  }

  if (normalizeRole(roleData?.role) === "admin") {
    const query = supabase
      .from("video_cases")
      .select("id, case_key, case_title, description, deleted_at, deleted_by, source_file_name, video_object_key, created_by, created_at, updated_at")
      .order("created_at", { ascending: false });
    const { data, error } = await (options?.trashed ? query.not("deleted_at", "is", null) : query.is("deleted_at", null));

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as VideoCaseRow[];
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("video_case_members")
    .select("video_case_id, member_role, created_at")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const caseIds = [...new Set((membershipRows ?? []).map((row) => row.video_case_id).filter(Boolean))];
  if (caseIds.length === 0) {
    return [];
  }

  const query = supabase
    .from("video_cases")
    .select("id, case_key, case_title, description, deleted_at, deleted_by, source_file_name, video_object_key, created_by, created_at, updated_at")
    .in("id", caseIds)
    .order("created_at", { ascending: false });
  const { data, error } = await (options?.trashed ? query.not("deleted_at", "is", null) : query.is("deleted_at", null));

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VideoCaseRow[];
}

export async function getVideoCaseAnalyses(videoCaseId: string): Promise<VideoCaseEvaluationRow[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select(
      "id, user_id, created_by, employee_number, video_case_id, analysis_kind, order_number, subject_name, overall_suggestion, rubric, analysis_ai_model, analysis_ai_output, analysis_ai_raw_text, pdf_storage_path, docx_storage_path, document_status, document_error, created_at",
    )
    .eq("video_case_id", videoCaseId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VideoCaseEvaluationRow[];
}

export async function getVideoCaseMembership(videoCaseId: string): Promise<VideoCaseMemberRow | null> {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error("Authentication required.");
  }

  const { data, error } = await supabase
    .from("video_case_members")
    .select("id, video_case_id, user_id, member_role, created_at")
    .eq("video_case_id", videoCaseId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as VideoCaseMemberRow | null) ?? null;
}

export async function getVideoCaseMembers(videoCaseId: string): Promise<VideoCaseMemberRow[]> {
  const { data, error } = await supabase
    .from("video_case_members")
    .select("id, video_case_id, user_id, member_role, created_at")
    .eq("video_case_id", videoCaseId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VideoCaseMemberRow[];
}

export async function getVideoCaseAggregates(
  videoCaseId: string,
): Promise<VideoCaseAggregateRow[]> {
  const { data, error } = await supabase
    .from("video_case_aggregates")
    .select("*")
    .eq("video_case_id", videoCaseId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VideoCaseAggregateRow[];
}

export async function getVideoCaseAggregate(
  aggregateId: string,
): Promise<VideoCaseAggregateRow | null> {
  const { data, error } = await supabase
    .from("video_case_aggregates")
    .select("*")
    .eq("id", aggregateId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as VideoCaseAggregateRow | null) ?? null;
}

export async function getVideoCaseAggregateSourceIds(
  aggregateId: string,
  fallbackIds: number[],
): Promise<number[]> {
  const { data, error } = await supabase
    .from("video_case_aggregate_sources")
    .select("evaluation_id, source_position")
    .eq("aggregate_id", aggregateId)
    .order("source_position", { ascending: true });

  if (error) {
    return resolveAggregateSourceIds([], fallbackIds);
  }

  return resolveAggregateSourceIds(data ?? [], fallbackIds);
}

export async function deleteVideoCaseEvaluation(evaluationId: number): Promise<void> {
  const { error } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", evaluationId);

  if (error) {
    if (error.code === "23503") {
      throw new Error("This evaluation is used by a combined summary and cannot be deleted.");
    }
    throw new Error(error.message);
  }
}

export async function deleteVideoCaseAggregate(aggregateId: string): Promise<void> {
  const { data, error } = await supabase
    .from("video_case_aggregates")
    .delete()
    .eq("id", aggregateId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "Aggregate not found or you do not have permission to delete it.",
    );
  }
}

export async function getVideoCaseAggregateDocumentUrls(aggregateId: string): Promise<{
  pdfUrl: string | null;
  docxUrl: string | null;
}> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    pdfUrl: string | null;
    docxUrl: string | null;
    error?: string;
  }>("document-artifact-url", {
    body: { aggregateId },
  });

  if (error || !data?.ok) {
    throw new Error(error?.message || data?.error || "Aggregate document is not ready.");
  }

  return { pdfUrl: data.pdfUrl, docxUrl: data.docxUrl };
}

export async function combineVideoCaseAnalyses(params: {
  videoCaseId: string;
  caseTitle: string;
  sourceRuns: Array<{
    id: number;
    user_id: string | null;
    employee_number?: string | null;
    evaluation_id: number | null;
    run_kind?: string;
    rubric?: Record<string, unknown>;
    matrix?: Record<string, unknown>;
    ai_output?: Record<string, unknown> | null;
    ai_raw_text?: string | null;
    notes?: string | null;
    created_at?: string | null;
    order_number?: string | null;
  }>;
  prompt?: string;
}): Promise<VideoCaseAggregateRow> {
  if (!params.sourceRuns.length) throw new Error("Select at least one evaluation.");
  const stats = combineAggregateStatistics(params.sourceRuns);
  const result = { ...stats, caseId:params.videoCaseId, caseTitle:params.caseTitle, sourceRunCount:params.sourceRuns.length, model:null, analysis:null, rawText:null };
  // The report submission starts the n8n workflow; combining scores does not call Gemini twice.
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error("Authentication required.");
  }

  const { data, error } = await supabase
    .from("video_case_aggregates")
    .insert({
      video_case_id: params.videoCaseId,
      requested_by: userData.user.id,
      source_evaluation_ids: params.sourceRuns
        .map((run) => run.evaluation_id)
        .filter((value): value is number => typeof value === "number"),
      source_count: result.sourceRunCount,
      source_snapshot: {
        case_id: result.caseId,
        case_title: result.caseTitle,
        source_runs: params.sourceRuns,
        combine_prompt: params.prompt || null,
        question_averages_by_section: result.aggregatedScores,
        question_averages: result.aggregatedScores,
        section_averages: result.sectionAverages,
        matrix_averages: result.aggregatedMatrix,
      },
      combined_scores: result.aggregatedScores,
      section_averages: result.sectionAverages,
      ai_model: result.model,
      ai_output: typeof result.analysis === "object" && result.analysis !== null ? result.analysis : null,
      ai_raw_text: typeof result.analysis === "string" ? result.analysis : result.rawText || null,
      status: "ready",
      error: null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as VideoCaseAggregateRow;
}

export async function sendVideoCaseAggregateToN8n(aggregateId: string): Promise<VideoCaseAggregateRow> {
  return sendVideoCaseAggregateToN8nWithPrompt(aggregateId, null);
}

export async function sendVideoCaseAggregateToN8nWithPrompt(
  aggregateId: string,
  combinePromptOverride: string | null,
): Promise<VideoCaseAggregateRow> {
  const aggregate = await getVideoCaseAggregate(aggregateId);
  if (!aggregate) {
    throw new Error("Aggregate not found.");
  }

  if (aggregate.document_status === "ready") return aggregate;

  const requestedByEmployeeNumber = await getCurrentUserEmployeeNumber();
  const sourceSnapshot = (aggregate.source_snapshot || {}) as Record<string, unknown>;
  const combinePrompt = typeof combinePromptOverride === "string"
    ? combinePromptOverride.trim() || null
    : typeof sourceSnapshot.combine_prompt === "string"
      ? sourceSnapshot.combine_prompt
      : null;
  const summary = buildVideoCaseSummaryPayload({
    aggregate,
    requestedByEmployeeNumber,
    combinePrompt,
  });

  // The server atomically owns dispatch/pending state and duplicate prevention.
  const { data: documentData, error: documentError } = await supabase.functions.invoke("forward-to-n8n", {
    body: summary,
  });

  // A callback can arrive even when the browser loses the delivery response.
  const latestAggregate = await getVideoCaseAggregate(aggregate.id);
  if (latestAggregate?.document_status === "ready") return latestAggregate;
  if (documentError || !documentData?.ok) {
    throw new Error(documentData?.error || documentError?.message || "Failed to start aggregate document generation. Inspect its status before resubmitting.");
  }
  if (!latestAggregate) {
    throw new Error("Aggregate disappeared after document dispatch.");
  }
  return latestAggregate;
}
