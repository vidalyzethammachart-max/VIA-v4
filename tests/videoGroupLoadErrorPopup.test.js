import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

for (const [file, action] of [
  ["VideoGroupCreatePage", "load_selectable_evaluations"],
  ["VideoGroupsPage", "load_groups"],
  ["VideoGroupDetailPage", "load_group"],
  ["VideoGroupDocumentPreviewPage", "load_group_preview"],
]) {
  test(`${file}: a load failure opens the error popup and is reported`, () => {
    const source = read(`../src/page/${file}.tsx`);
    assert.match(source, new RegExp(`reportError\\(error, \\{ source: "popup", context: \\{ action: "${action}"`));
    assert.match(source, /setLoadErrorPopup\(/);
    assert.match(source, /<ErrorNoticeModal isOpen=\{loadErrorPopup !== null\} detail=\{loadErrorPopup\} onClose=\{\(\) => setLoadErrorPopup\(null\)\} \/>/);
  });
}
