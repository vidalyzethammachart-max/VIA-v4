type SupersedeRow = {
  id: number;
  user_id: string | null;
  video_case_id: string | null;
  document_status: string | null;
  created_at: string;
};

export function collapseSupersededEvaluations<T extends SupersedeRow>(rows: T[] | null | undefined): T[];

export function findSupersedingEvaluation<T extends SupersedeRow>(
  record: SupersedeRow,
  siblings: T[] | null | undefined,
): T | null;
