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
  ["case detail page", "../src/page/VideoCaseDetailPage.tsx"],
]) {
  test(`${name} sends combining to the video group create page`, () => {
    const source = read(path);
    assert.match(source, /\/video-groups\/new\?caseId=\$\{selectedCase\.id\}/);
    assert.match(source, /รวมเป็นแบบประเมินกลุ่ม/);
    assert.doesNotMatch(source, /combineVideoCaseAnalyses|handleCombine|CaseEvaluationPicker/);
  });
}

test("the /video-cases list page is gone and its links point at video groups", () => {
  const app = read("../src/App.tsx");
  assert.doesNotMatch(app, /VideoCasesPage/);
  assert.doesNotMatch(app, /path="\/video-cases"/);
  assert.match(app, /path="\/video-cases\/:videoCaseId"/);
  for (const path of ["../src/page/FormSubmit.tsx", "../src/page/Home.tsx", "../src/page/MyFormsDashboard.tsx", "../src/components/ProfileDropdown.tsx"]) {
    assert.doesNotMatch(read(path), /to="\/video-cases"|closeAndNavigate\("\/video-cases"\)/, path);
  }
});
