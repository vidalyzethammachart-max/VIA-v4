export interface CombinableEvaluation {
  id: number;
  document_status: string | null;
}

export function isCombinableEvaluation(run: CombinableEvaluation | null | undefined): boolean;

export function getCombinableEvaluationIds(runs: CombinableEvaluation[]): number[];

export function keepCombinableSelection(runs: CombinableEvaluation[], selectedIds: number[]): number[];
