export type VideoCaseSummaryAggregate = {
  id: string;
  video_case_id: string;
  source_evaluation_ids: number[];
  source_count: number;
  source_snapshot: Record<string, unknown>;
  combined_scores: Record<string, unknown>;
  section_averages?: Record<string, unknown>;
  ai_output: Record<string, unknown> | null;
  ai_raw_text: string | null;
};

export type VideoCaseSummaryPayload = {
  document_type: "video_case_summary";
  aggregate_id: string;
  video_case_id: string;
  case_title: string | null;
  subject_name: string;
  order_number: string | null;
  sender_employee_number: string | null;
  source_evaluation_ids: number[];
  source_count: number;
  question_averages: Record<string, unknown>;
  section_averages: Record<string, unknown> | null;
  aggregate_analysis: Record<string, unknown> | string | null;
  combine_prompt: string | null;
};

export function buildVideoCaseSummaryPayload(options: {
  aggregate: VideoCaseSummaryAggregate;
  requestedByEmployeeNumber: string | null;
  combinePrompt: string | null;
}): VideoCaseSummaryPayload;
