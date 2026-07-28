export interface VideoCaseSummaryDocumentAggregate {
  video_case_id: string;
  document_status: string | null;
  document_error: string | null;
  pdf_storage_path: string | null;
  docx_storage_path: string | null;
}

export type VideoCaseSummaryDocumentState =
  | { kind: "not_found" }
  | { kind: "mismatched_case" }
  | { kind: "pending" }
  | { kind: "failed"; error: string }
  | { kind: "ready_without_artifact" }
  | { kind: "ready"; hasPdf: boolean; hasDocx: boolean };

export function buildVideoCaseSummaryDocumentPreviewPath(
  videoCaseId: string,
  summaryId: string,
): string;

export function resolveVideoCaseSummaryDocumentState(
  aggregate: VideoCaseSummaryDocumentAggregate | null | undefined,
  videoCaseId: string,
): VideoCaseSummaryDocumentState;
