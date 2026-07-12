const DEFAULT_AGGREGATE_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

function getRequiredGeminiEnv() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  return {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || DEFAULT_AGGREGATE_MODEL,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function normalizeSourceRun(sourceRun) {
  return {
    id: sourceRun?.id || null,
    analyst_user_id: sourceRun?.analyst_user_id || null,
    evaluation_id: sourceRun?.evaluation_id || null,
    run_kind: sourceRun?.run_kind || "human",
    rubric: sourceRun?.rubric || {},
    matrix: sourceRun?.matrix || {},
    ai_output: sourceRun?.ai_output || null,
    ai_raw_text: sourceRun?.ai_raw_text || null,
    notes: sourceRun?.notes || null,
    created_at: sourceRun?.created_at || null,
  };
}

function buildAggregatePrompt({ caseTitle, caseId, sourceRuns, aggregatedScores, aggregatedMatrix, prompt }) {
  const basePrompt =
    prompt ||
    `You are an educational video evaluation assistant.

You are given multiple human analysis runs for the same video case.
Combine the reviewer data into a single consensus report.

Video case metadata:
- Case title: ${caseTitle || "untitled case"}
- Case ID: ${caseId}
- Reviewer count: ${sourceRuns.length}

Use the averaged rubric and matrix as the primary quantitative signal.
Also compare the individual reviewer notes and AI outputs if they exist.

Return JSON only:
{
  "summary": "Brief synthesized summary for the full video case",
  "consensus": "What the reviewers agree on most strongly",
  "differences": ["Important reviewer disagreements or uncertainty"],
  "strengths": ["Main strengths across reviewers"],
  "issues": ["Main issues across reviewers"],
  "recommendations": ["Actionable recommendations for the final video"],
  "confidence": "low | medium | high",
  "reviewer_count": 0,
  "notes": ["Any important limitations or caveats"]
}

Scoring guidance:
- Base the summary on the combined reviewer evidence.
- If reviewers disagree, mention it directly.
- If some categories lack evidence, say so explicitly.
- Do not invent details that are not supported by the source runs.`;

  const compactRuns = sourceRuns.map(normalizeSourceRun);

  return `${basePrompt}

Structured inputs:
${JSON.stringify(
  {
    case_id: caseId,
    case_title: caseTitle || "untitled case",
    reviewer_count: compactRuns.length,
    aggregated_scores: aggregatedScores,
    aggregated_matrix: aggregatedMatrix,
    source_runs: compactRuns,
  },
  null,
  2,
)}
`;
}

function parseModelJson(outputText) {
  if (!outputText) {
    return null;
  }

  const cleaned = outputText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function analyzeTextWithGemini({ caseTitle, caseId, sourceRuns, prompt, aggregatedScores, aggregatedMatrix }) {
  const env = getRequiredGeminiEnv();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.model)}:generateContent?key=${encodeURIComponent(env.apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildAggregatePrompt({
                caseTitle,
                caseId,
                sourceRuns,
                aggregatedScores,
                aggregatedMatrix,
                prompt,
              }),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const outputText = payload?.candidates?.[0]?.content?.parts
    ?.filter((part) => typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!outputText) {
    throw new Error("Gemini API returned an empty response.");
  }

  return {
    model: env.model,
    outputText,
    parsed: parseModelJson(outputText),
  };
}

export function combineAggregateStatistics(sourceRuns) {
  const rubric = combineNestedValues(sourceRuns.map((run) => run?.rubric ?? null)) || {};
  const matrix = combineNestedValues(sourceRuns.map((run) => run?.matrix ?? null)) || {};

  return {
    aggregatedScores: rubric,
    aggregatedMatrix: matrix,
  };
}

export async function aggregateVideoCaseAnalyses({
  caseTitle,
  caseId,
  sourceRuns,
  prompt,
}) {
  if (!Array.isArray(sourceRuns) || sourceRuns.length === 0) {
    throw new Error("At least one analysis run is required for aggregation.");
  }

  const { aggregatedScores, aggregatedMatrix } = combineAggregateStatistics(sourceRuns);
  const analysis = await analyzeTextWithGemini({
    caseTitle,
    caseId,
    sourceRuns,
    prompt,
    aggregatedScores,
    aggregatedMatrix,
  });

  return {
    status: "analyzed",
    caseTitle,
    caseId,
    sourceRunCount: sourceRuns.length,
    aggregatedScores,
    aggregatedMatrix,
    model: analysis.model,
    analysis: analysis.parsed || analysis.outputText,
    rawText: analysis.parsed ? undefined : analysis.outputText,
  };
}

