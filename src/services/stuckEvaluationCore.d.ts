export const STUCK_EVALUATION_MS: number;

export function isEvaluationStuck(
  run: { document_status: string | null; created_at: string } | null | undefined,
  nowMs?: number,
): boolean;
