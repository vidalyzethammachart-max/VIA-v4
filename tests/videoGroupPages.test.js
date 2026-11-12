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

test("page does not re-merge hidden selected ids when the picker changes", () => {
  const source = read("../src/page/VideoGroupCreatePage.tsx");
  assert.match(source, /onChange=\{setSelectedIds\}/);
  assert.doesNotMatch(source, /selectedIds\.filter\(\(id\) => !visible\.has\(id\)\)/);
});

test("picker accepts a block reason and count override computed from the full list", () => {
  const picker = read("../src/components/CaseEvaluationPicker.tsx");
  assert.match(picker, /blockReason\?: string \| null/);
  assert.match(picker, /selectedCount\?: number/);
  assert.match(picker, /blockReasonOverride !== undefined/);
  const page = read("../src/page/VideoGroupCreatePage.tsx");
  assert.match(page, /blockReason=\{blockReason\}/);
  assert.match(page, /selectedCount=\{selected\.length\}/);
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

test("App registers the three group routes with a plain ProtectedRoute", () => {
  const app = read("../src/App.tsx");
  for (const [path, component] of [
    ["/video-groups", "VideoGroupsPage"],
    ["/video-groups/new", "VideoGroupCreatePage"],
    ["/video-groups/:groupId", "VideoGroupDetailPage"],
  ]) {
    const re = new RegExp(
      `path="${path}"\\s+element=\\{\\s*<ProtectedRoute>\\s*<${component} />\\s*</ProtectedRoute>`,
    );
    assert.match(app, re, `${path} route missing or not a plain ProtectedRoute`);
  }
});

test("list page uses getVideoGroups and links to the create page", () => {
  const source = read("../src/page/VideoGroupsPage.tsx");
  assert.match(source, /export default function VideoGroupsPage/);
  assert.match(source, /getVideoGroups/);
  assert.match(source, /buildVideoGroupDisplayName/);
  assert.match(source, /["'`]\/video-groups\/new["'`]/);
  assert.match(source, /["'`]\/video-groups\/\$\{/);
});

test("detail page sends, shows documents and takes sources from the sources table", () => {
  const source = read("../src/page/VideoGroupDetailPage.tsx");
  assert.match(source, /export default function VideoGroupDetailPage/);
  for (const name of [
    "sendVideoGroupToN8n",
    "getVideoGroupDocumentUrls",
    "getVideoGroupSources",
    "buildCombinedSuggestionDraft",
    "submittingRef",
    "SectionCard",
  ]) {
    assert.match(source, new RegExp(name), `${name} missing`);
  }
  assert.match(source, /finally\s*{[^}]*submittingRef\.current = false/);
  assert.doesNotMatch(source, /source_runs[^;\n]*(case_title|case_key|video_case)/);
  assert.match(source, /video_case_id/);
});

test("navigation links to /video-groups from the dropdown and Home", () => {
  assert.match(read("../src/components/ProfileDropdown.tsx"), /\/video-groups/);
  assert.match(read("../src/page/Home.tsx"), /\/video-groups/);
});

test("every videoGroups key used by list and detail pages exists in th and en", () => {
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  const th = translations.slice(0, enStart);
  const en = translations.slice(enStart);
  for (const file of [
    "../src/page/VideoGroupsPage.tsx",
    "../src/page/VideoGroupDetailPage.tsx",
    "../src/components/ProfileDropdown.tsx",
    "../src/page/Home.tsx",
  ]) {
    const keys = [...new Set([...read(file).matchAll(/t\(\s*"(videoGroups\.[^"]+)"/g)].map((m) => m[1]))];
    for (const key of keys) {
      assert.ok(th.includes(`"${key}":`), `th missing ${key}`);
      assert.ok(en.includes(`"${key}":`), `en missing ${key}`);
    }
  }
});
