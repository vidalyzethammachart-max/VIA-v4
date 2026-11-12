import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("summary page is the group evaluation and prefills the suggestion", () => {
  const source = read("../src/page/VideoCaseSummaryPage.tsx");
  assert.match(source, /แบบประเมินกลุ่มวิดีโอ/);
  assert.match(source, /buildCombinedSuggestionDraft\(sourceRuns\)/);
});

for (const [name, path] of [
  ["video cases page", "../src/page/VideoCasesPage.tsx"],
  ["case detail page", "../src/page/VideoCaseDetailPage.tsx"],
]) {
  test(`${name} sends combining to the video group create page`, () => {
    const source = read(path);
    assert.match(source, /\/video-groups\/new\?caseId=\$\{selectedCase\.id\}/);
    assert.match(source, /รวมเป็นแบบประเมินกลุ่ม/);
    assert.doesNotMatch(source, /combineVideoCaseAnalyses|handleCombine|CaseEvaluationPicker/);
  });
}

test("video cases page keeps the trash flow without the per-case evaluation delete", () => {
  const source = read("../src/page/VideoCasesPage.tsx");
  assert.match(source, /handleTrashChange/);
  assert.doesNotMatch(source, /handleDeleteEvaluation|evaluationToDelete/);
});
