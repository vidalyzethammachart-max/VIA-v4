export type VideoCaseAggregateHistoryInput = {
  id?: unknown;
  requested_by_name?: unknown;
  requested_by_employee_number?: unknown;
  source_evaluation_ids?: unknown;
  source_count?: unknown;
  status?: unknown;
  document_status?: unknown;
  created_at?: unknown;
};

export type VideoCaseAggregateHistoryItem = {
  aggregateId: string;
  shortAggregateId: string;
  creatorName: string;
  employeeNumber: string;
  sourceEvaluationIds: number[];
  sourceCount: number;
  analysisStatus: string;
  documentStatus: string;
  createdAt: string;
};

export function buildVideoCaseAggregateHistoryItem(
  aggregate: VideoCaseAggregateHistoryInput,
): VideoCaseAggregateHistoryItem;

export function buildVideoCaseAggregateSummaryPath(
  videoCaseId: string,
  aggregateId: string,
): string;
