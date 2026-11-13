import { buildVideoCaseSummaryPayload } from "./videoCaseSummaryPayloadCore.js";
import { buildVideoGroupDisplayName } from "./videoGroupCore.js";

// n8n payload for a cross-case group: the legacy summary payload adapted to the group,
// keyed by group id (aggregate_id) and never carrying an evaluation_id.
// `group.sources` (optional, ordered rows of video_group_evaluation_sources) supplies the
// first source's case; the snapshot's source_runs supply the evaluation ids and notes.
// The tick table must show what the group detail page shows: each question average rounded to the
// nearest whole score (Math.round, like toLikertValue there). n8n reads `rubric` before
// `question_averages`, and would otherwise tick the decimal average's truncated column.
function roundRubricForDocument(combinedScores) {
  const rubric = {};
  for (const [sectionId, questions] of Object.entries(combinedScores || {})) {
    if (!questions || typeof questions !== "object") continue;
    const rounded = {};
    for (const [questionId, value] of Object.entries(questions)) {
      const score = Math.round(Number(value));
      if (Number.isFinite(score) && score >= 1 && score <= 5) rounded[questionId] = score;
    }
    rubric[sectionId] = rounded;
  }
  return rubric;
}

function sectionAveragesOf(rubric) {
  const result = {};
  for (const [sectionId, questions] of Object.entries(rubric)) {
    const scores = Object.values(questions);
    if (scores.length === 0) continue;
    result[sectionId] = Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2));
  }
  return result;
}

export function buildVideoGroupSummaryPayload({ group, requestedByEmployeeNumber, combinePrompt }) {
  const snapshot = group.source_snapshot || {};
  const sourceRuns = Array.isArray(snapshot.source_runs) ? snapshot.source_runs : [];
  const sources = Array.isArray(group.sources) ? group.sources : [];
  const firstRun = sourceRuns.find((run) => run && typeof run === "object") || {};
  const videoCaseId = sources[0]?.video_case_id ?? firstRun.video_case_id ?? null;
  const evaluationIds = sources.length
    ? sources.map((source) => source.evaluation_id)
    : sourceRuns.map((run) => run.evaluation_id ?? run.id).filter((id) => id != null);
  const displayName = buildVideoGroupDisplayName(group.group_type, group.subject_name);
  // Round once, before sending, so every score n8n and the Apps Script see is the whole score the
  // group detail page shows; no decimal reaches the document.
  const roundedScores = roundRubricForDocument(group.combined_scores);
  const roundedSectionAverages = sectionAveragesOf(roundedScores);

  const payload = buildVideoCaseSummaryPayload({
    aggregate: {
      id: group.id,
      video_case_id: videoCaseId,
      source_evaluation_ids: evaluationIds,
      source_count: group.source_count,
      source_snapshot: { ...snapshot, case_title: displayName },
      combined_scores: roundedScores,
      section_averages: roundedSectionAverages,
      ai_output: group.ai_output ?? null,
      ai_raw_text: group.ai_raw_text ?? null,
    },
    requestedByEmployeeNumber,
    combinePrompt,
  });

  return {
    ...payload,
    aggregate_id: group.id,
    video_case_id: videoCaseId,
    order_number: group.order_number,
    subject_name: displayName,
    source_evaluation_ids: evaluationIds,
    source_count: group.source_count,
    rubric: roundedScores,
  };
}
