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

export interface CombineSourceRun {
  id: number;
  user_id: string | null;
  employee_number: string | null;
  evaluation_id: number;
  run_kind: string;
  rubric: Record<string, unknown>;
  matrix: Record<string, unknown>;
  ai_output: Record<string, unknown> | null;
  ai_raw_text: string | null;
  notes: string | null;
  created_at: string;
  order_number: string | null;
}

export function toCombineSourceRuns(runs: Array<CombinableEvaluation & {
  user_id: string | null;
  employee_number: string | null;
  analysis_kind: string;
  rubric: Record<string, unknown>;
  analysis_ai_output: Record<string, unknown> | null;
  analysis_ai_raw_text: string | null;
  overall_suggestion: string | null;
  created_at: string;
  order_number: string | null;
}>): CombineSourceRun[];
