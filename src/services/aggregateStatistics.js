function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getAnalysisMatrix(output) {
  const nested = output?.analysis?.quality_scores;
  if (isPlainObject(nested)) return nested;
  return isPlainObject(output?.quality_scores) ? output.quality_scores : {};
}

function toNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function averageNumericValues(values) {
  const numeric = values.map(toNumeric).filter((value) => typeof value === "number");
  if (numeric.length === 0) {
    return null;
  }

  const total = numeric.reduce((sum, value) => sum + value, 0);
  return Number((total / numeric.length).toFixed(2));
}

function combineNestedValues(values) {
  const filtered = values.filter((value) => value !== null && value !== undefined);
  if (filtered.length === 0) {
    return null;
  }

  const numericAverage = averageNumericValues(filtered);
  if (numericAverage !== null) {
    return numericAverage;
  }

  if (filtered.every(Array.isArray)) {
    const maxLength = Math.max(...filtered.map((value) => value.length));
    const result = [];

    for (let index = 0; index < maxLength; index += 1) {
      const combined = combineNestedValues(filtered.map((value) => value[index]));
      if (combined !== null) {
        result.push(combined);
      }
    }

    return result.length > 0 ? result : null;
  }

  if (filtered.every(isPlainObject)) {
    const keys = new Set();
    filtered.forEach((entry) => {
      Object.keys(entry).forEach((key) => keys.add(key));
    });

    const result = {};
    keys.forEach((key) => {
      const combined = combineNestedValues(filtered.map((entry) => entry[key]));
      if (combined !== null) {
        result[key] = combined;
      }
    });

    return Object.keys(result).length > 0 ? result : null;
  }

  return filtered[0];
}

function computeSectionAverages(questionAverages) {
  if (!isPlainObject(questionAverages)) {
    return {};
  }

  const result = {};

  for (const [sectionId, questions] of Object.entries(questionAverages)) {
    if (!isPlainObject(questions)) {
      continue;
    }

    const scores = Object.values(questions)
      .map(toNumeric)
      .filter((value) => typeof value === "number");

    if (scores.length === 0) {
      continue;
    }

    const total = scores.reduce((sum, value) => sum + value, 0);
    result[sectionId] = Number((total / scores.length).toFixed(2));
  }

  return result;
}

export function combineAggregateStatistics(sourceRuns) {
  const questionAverages = combineNestedValues(sourceRuns.map((run) => run?.rubric ?? null)) || {};
  const matrix = combineNestedValues(sourceRuns.map((run) => run?.matrix ?? null)) || {};
  const sectionAverages = computeSectionAverages(questionAverages);

  return {
    questionAveragesBySection: questionAverages,
    aggregatedScores: questionAverages,
    sectionAverages,
    aggregatedMatrix: matrix,
  };
}
