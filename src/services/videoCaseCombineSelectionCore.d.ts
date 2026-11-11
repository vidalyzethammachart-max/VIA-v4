export interface CombinableEvaluation {
  id: number;
  document_status: string | null;
}

export function isCombinableEvaluation(run: CombinableEvaluation | null | undefined): boolean;

export function getCombinableEvaluationIds(runs: CombinableEvaluation[]): number[];

export function keepCombinableSelection(runs: CombinableEvaluation[], selectedIds: number[]): number[];

export const MIN_COMBINE_COUNT: number;

export const COMBINE_MIN_MESSAGE: string;

export function getCombineBlockReason(runs: CombinableEvaluation[], selectedIds: number[]): string | null;
