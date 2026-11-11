import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("summary page is the group evaluation and prefills the suggestion", () => {
  const source = read("../src/page/VideoCaseSummaryPage.tsx");
  assert.match(source, /แบบประเมินกลุ่มวิดีโอ/);
  assert.match(source, /buildCombinedSuggestionDraft\(sourceRuns\)/);
});

test("video cases page selects and combines evaluations itself", () => {
  const source = read("../src/page/VideoCasesPage.tsx");
  assert.match(source, /CaseEvaluationPicker/);
  assert.match(source, /getCombineBlockReason\(/);
  assert.match(source, /toCombineSourceRuns\(/);
  assert.match(source, /รวมเป็นแบบประเมินกลุ่ม/);
  assert.doesNotMatch(source, /handleDeleteEvaluation|evaluationToDelete/);
});

test("case detail page shares the combine rule and source-run mapping", () => {
  const source = read("../src/page/VideoCaseDetailPage.tsx");
  assert.match(source, /getCombineBlockReason\(/);
  assert.match(source, /toCombineSourceRuns\(/);
  assert.doesNotMatch(source, /อย่างน้อย 1 รายการ/);
});
