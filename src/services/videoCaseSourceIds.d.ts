export type AggregateSourceRow = {
  evaluation_id: number;
  source_position: number;
};

export function resolveAggregateSourceIds(
  sourceRows: AggregateSourceRow[] | null | undefined,
  fallbackIds: number[] | null | undefined,
): number[];
