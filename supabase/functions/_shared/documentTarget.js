const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveDocumentTarget(payload) {
  const evaluationId = Number(payload?.evaluation_id);
  const aggregateId =
    typeof payload?.aggregate_id === "string" ? payload.aggregate_id.trim() : "";
  const hasEvaluation = Number.isInteger(evaluationId) && evaluationId > 0;
  const hasAggregate = UUID_PATTERN.test(aggregateId);

  if (hasEvaluation && hasAggregate) {
    throw new Error("Document payload must not contain both evaluation_id and aggregate_id.");
  }

  if (payload?.document_type == null || payload.document_type === "") {
    if (hasEvaluation) {
      return {
        kind: "evaluation",
        table: "evaluations",
        id: evaluationId,
        documentType: "evaluation",
      };
    }

    if (hasAggregate) {
      return {
        kind: "aggregate",
        table: "video_case_aggregates",
        id: aggregateId,
        documentType: "video_case_summary",
      };
    }
  }

  if (payload?.document_type === "evaluation") {
    if (!hasEvaluation) {
      throw new Error("evaluation_id is required for an evaluation document.");
    }
    return {
      kind: "evaluation",
      table: "evaluations",
      id: evaluationId,
      documentType: "evaluation",
    };
  }

  if (payload?.document_type === "video_case_summary") {
    if (!hasAggregate) {
      throw new Error("aggregate_id is required for a video case summary.");
    }
    return {
      kind: "aggregate",
      table: "video_case_aggregates",
      id: aggregateId,
      documentType: "video_case_summary",
    };
  }

  throw new Error("Unsupported document_type.");
}
