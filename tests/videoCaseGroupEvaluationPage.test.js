import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("summary page is the group evaluation and prefills the suggestion", () => {
  const source = read("../src/page/VideoCaseSummaryPage.tsx");
  assert.match(source, /แบบประเมินกลุ่มวิดีโอ/);
  assert.match(source, /buildCombinedSuggestionDraft\(sourceRuns\)/);
});
