function toPositiveInteger(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function uniquePositiveIds(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const id = toPositiveInteger(value);
    if (id !== null && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}

export function resolveAggregateSourceIds(sourceRows, fallbackIds) {
  const orderedRows = Array.isArray(sourceRows)
    ? sourceRows
        .filter((row) => row && typeof row === "object")
        .slice()
        .sort((left, right) => Number(left.source_position) - Number(right.source_position))
    : [];
  const relationalIds = uniquePositiveIds(orderedRows.map((row) => row.evaluation_id));

  return relationalIds.length > 0
    ? relationalIds
    : uniquePositiveIds(Array.isArray(fallbackIds) ? fallbackIds : []);
}
