import type { VideoCaseSummaryPayload } from "./videoCaseSummaryPayloadCore.js";

export type VideoGroupSummaryGroup = {
  id: string;
  order_number: string;
  group_type: string;
  subject_name: string;
  source_count: number;
  source_snapshot: Record<string, unknown>;
  combined_scores: Record<string, unknown>;
  section_averages?: Record<string, unknown>;
  ai_output?: Record<string, unknown> | null;
  ai_raw_text?: string | null;
  sources?: Array<{ evaluation_id: number; video_case_id: string; source_position: number }>;
};

export function buildVideoGroupSummaryPayload(options: {
  group: VideoGroupSummaryGroup;
  requestedByEmployeeNumber: string | null;
  combinePrompt: string | null;
}): Omit<VideoCaseSummaryPayload, "video_case_id"> & { video_case_id: string | null };
