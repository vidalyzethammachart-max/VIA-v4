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

export function findSupersededIds(rows: SupersedeRow[] | null | undefined): Set<number>;

export function findStuckSupersededByReady(
  stuckRows: Array<{ evaluation_id: number; order_number?: string | null; subject_name?: string | null }> | null | undefined,
  readyRows: Array<{ order_number?: string | null; subject_name?: string | null }> | null | undefined,
): Set<number>;
