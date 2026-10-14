export function getAnalysisMatrix(output: unknown): Record<string, unknown>;
export function combineAggregateStatistics(runs: Array<{rubric?: Record<string, unknown>; matrix?: Record<string, unknown>}>): {
  questionAveragesBySection: Record<string, unknown>;
  aggregatedScores: Record<string, unknown>;
  sectionAverages: Record<string, number>;
  aggregatedMatrix: Record<string, unknown>;
};
