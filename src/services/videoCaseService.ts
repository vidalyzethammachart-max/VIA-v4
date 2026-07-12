import { supabase } from "../lib/supabaseClient";
import { normalizeRole } from "../lib/roles";

export type VideoCaseMemberRole = "member" | "leader";
export type VideoCaseAggregateStatus = "pending" | "ready" | "failed";

export type VideoCaseRow = {
  id: string;
  case_key: string;
  case_title: string;
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
  source_evaluation_ids: number[];
  source_count: number;
  source_snapshot: Record<string, unknown>;
  combined_scores: Record<string, unknown>;
  ai_model: string | null;
  ai_output: Record<string, unknown> | null;
  ai_raw_text: string | null;
  status: VideoCaseAggregateStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoCaseEvaluationRow = {
  id: number;
  user_id: string | null;
  video_case_id: string | null;
  analysis_kind: "human" | "aggregate";
  order_number: string | null;
  subject_name: string | null;
  overall_suggestion: string | null;
  rubric: Record<string, unknown>;
  analysis_ai_model: string | null;
  analysis_ai_output: Record<string, unknown> | null;
  analysis_ai_raw_text: string | null;
  document_status: "pending" | "ready" | "failed";
  document_error: string | null;
  created_at: string;
};

type AggregateApiResponse = {
  status: "analyzed";
  caseId: string;
  caseTitle: string;
  sourceRunCount: number;
  aggregatedScores: Record<string, unknown>;
  aggregatedMatrix: Record<string, unknown>;
  model: string;
  analysis: Record<string, unknown> | string;
  rawText?: string;
};

function getUploadApiBaseUrl() {
  const configured = import.meta.env.VITE_UPLOAD_VIDEO_API_URL as string | undefined;
  const url = new URL(configured || window.location.origin);
  return url.toString().replace(/\/$/, "");
}

function buildApiUrl(pathname: string) {
  const base = new URL(getUploadApiBaseUrl());
  base.pathname = pathname;
  base.search = "";
  return base.toString();
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return response.statusText || "Request failed.";
  }

  try {
    const payload = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof payload.error === "string" && payload.error) {
      return payload.error;
    }
    if (typeof payload.message === "string" && payload.message) {
      return payload.message;
    }
  } catch {
    // Use raw text below.
  }

  return text;
}

export async function resolveVideoCaseMembership(
  options?: {
    orderNumber?: string;
    subjectName?: string;
    shortCode?: string;
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

  const rpcArgs = options?.orderNumber && options?.subjectName && options?.shortCode
    ? {
        p_order_number: options.orderNumber,
        p_subject_name: options.subjectName,
        p_short_code: options.shortCode,
        p_case_title: options.caseTitle ?? null,
        p_source_file_name: options.sourceFileName ?? null,
        p_video_object_key: options.videoObjectKey ?? null,
        p_member_role: options.memberRole ?? "member",
      }
    : {
        p_case_key: options?.caseKey ?? "",
        p_case_title: options?.caseTitle ?? null,
        p_source_file_name: options?.sourceFileName ?? null,
        p_video_object_key: options?.videoObjectKey ?? null,
        p_member_role: options?.memberRole ?? "member",
      };

  const { data, error } = await supabase.rpc("resolve_video_case_membership", rpcArgs);

  if (error) {
    throw new Error(error.message);
  }

  return data as VideoCaseRow;
}

export async function getMyVideoCases(): Promise<VideoCaseRow[]> {
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
    const { data, error } = await supabase
      .from("video_cases")
      .select("id, case_key, case_title, source_file_name, video_object_key, created_by, created_at, updated_at")
      .order("created_at", { ascending: false });

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

  const { data, error } = await supabase
    .from("video_cases")
    .select("id, case_key, case_title, source_file_name, video_object_key, created_by, created_at, updated_at")
    .in("id", caseIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VideoCaseRow[];
}

export async function getVideoCaseAnalyses(videoCaseId: string): Promise<VideoCaseEvaluationRow[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select(
      "id, user_id, video_case_id, analysis_kind, order_number, subject_name, overall_suggestion, rubric, analysis_ai_model, analysis_ai_output, analysis_ai_raw_text, document_status, document_error, created_at",
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

export async function combineVideoCaseAnalyses(params: {
  videoCaseId: string;
  caseTitle: string;
  sourceRuns: Array<{
    id: number;
    user_id: string | null;
    evaluation_id: number | null;
    run_kind?: string;
    rubric?: Record<string, unknown>;
    matrix?: Record<string, unknown>;
    ai_output?: Record<string, unknown> | null;
    ai_raw_text?: string | null;
    notes?: string | null;
    created_at?: string | null;
  }>;
  prompt?: string;
}): Promise<VideoCaseAggregateRow> {
  const apiResponse = await fetch(buildApiUrl("/api/analyze-video-case"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      caseId: params.videoCaseId,
      caseTitle: params.caseTitle,
      sourceRuns: params.sourceRuns.map((run) => ({
        id: run.id,
        analyst_user_id: run.user_id,
        evaluation_id: run.evaluation_id,
        run_kind: run.run_kind || "human",
        rubric: run.rubric || {},
        matrix: run.matrix || {},
        ai_output: run.ai_output || null,
        ai_raw_text: run.ai_raw_text || null,
        notes: run.notes || null,
        created_at: run.created_at || null,
      })),
      prompt: params.prompt || null,
    }),
  });

  if (!apiResponse.ok) {
    throw new Error(await readErrorMessage(apiResponse));
  }

  const result = (await apiResponse.json()) as AggregateApiResponse;

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
      },
      combined_scores: result.aggregatedScores,
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
