export function buildVideoCaseSummaryDocumentPreviewPath(videoCaseId, summaryId) {
  return `/video-cases/${encodeURIComponent(videoCaseId)}/summaries/${encodeURIComponent(summaryId)}/preview`;
}

export function resolveVideoCaseSummaryDocumentState(aggregate, videoCaseId) {
  if (!aggregate) return { kind: "not_found" };
  if (aggregate.video_case_id !== videoCaseId) return { kind: "mismatched_case" };
  if (aggregate.document_status === "pending") return { kind: "pending" };
  if (aggregate.document_status === "failed") {
    return {
      kind: "failed",
      error: aggregate.document_error || "Document generation failed.",
    };
  }

  const hasPdf = Boolean(aggregate.pdf_storage_path);
  const hasDocx = Boolean(aggregate.docx_storage_path);
  if (!hasPdf && !hasDocx) return { kind: "ready_without_artifact" };

  return { kind: "ready", hasPdf, hasDocx };
}
