import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("create page wires selection, naming, review and creation", () => {
  const source = read("../src/page/VideoGroupCreatePage.tsx");
  assert.match(source, /export default function VideoGroupCreatePage/);
  for (const name of [
    "getSelectableEvaluations",
    "CaseEvaluationPicker",
    "GROUP_TYPES",
    "validateVideoGroupForm",
    "createVideoGroupEvaluation",
    "getCombineBlockReason",
    "combineAggregateStatistics",
  ]) {
    assert.match(source, new RegExp(name), `${name} missing`);
  }
  assert.match(source, /searchParams\.get\(\s*"caseId"\s*\)/);
  assert.match(source, /navigate\(`\/video-groups\/\$\{/);
  assert.match(source, /finally\s*{[^}]*setBusy\(false\)/);
});

test("picker shows the case label when video_cases is present", () => {
  const source = read("../src/components/CaseEvaluationPicker.tsx");
  assert.match(source, /video_cases/);
  assert.match(source, /case_title \|\| [\w.?]*case_key/);
});

test("every videoGroups translation key used by the page exists in th and en", () => {
  const source = read("../src/page/VideoGroupCreatePage.tsx");
  const keys = [...new Set([...source.matchAll(/t\(\s*"(videoGroups\.[^"]+)"/g)].map((m) => m[1]))];
  assert.ok(keys.length > 5, "expected the page to use videoGroups.* keys");
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  assert.ok(enStart > 0);
  const th = translations.slice(0, enStart);
  const en = translations.slice(enStart);
  for (const key of keys) {
    assert.ok(th.includes(`"${key}":`), `th missing ${key}`);
    assert.ok(en.includes(`"${key}":`), `en missing ${key}`);
  }
});
