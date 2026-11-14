import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const panel = read("../src/components/ErrorTestPanel.tsx");

test("the error log page shows the test panel", () => {
  const page = read("../src/page/SuperAdminErrorsPage.tsx");
  assert.match(page, /import ErrorTestPanel from "\.\.\/components\/ErrorTestPanel";/);
  assert.match(page, /<ErrorTestPanel \/>/);
});

test("each button raises an error that reaches its own source", () => {
  // popup: reported like the other popup sites, and the popup is shown
  assert.match(panel, /reportError\([\s\S]*?\{ source: "popup", context: \{ action: "error_test" \} \}\)/);
  assert.match(panel, /<ErrorNoticeModal/);
  // window_error: thrown outside React so the global handler sees it
  assert.match(panel, /setTimeout\(\(\) => \{\s*throw new Error\(/);
  // unhandled_rejection
  assert.match(panel, /void Promise\.reject\(new Error\(/);
  // network: an invalid uuid makes PostgREST answer 400 through the logging fetch wrapper
  assert.match(panel, /supabase\.from\("video_group_evaluations"\)\.select\("id"\)\.eq\("id", "not-a-uuid"\)/);
  // react: a child that throws while rendering, caught by AppErrorBoundary
  assert.match(panel, /function CrashOnRender\(\{ message \}: \{ message: string \}\): never \{\s*throw new Error\(message\);/);
  assert.match(panel, /\{crashMessage && <CrashOnRender message=\{crashMessage\} \/>\}/);
});

test("test messages are unique so the one-minute dedupe does not swallow repeat clicks", () => {
  assert.match(panel, /function testMessage\(kind: string\): string \{\s*return `\[TEST\] \$\{kind\} \$\{new Date\(\)\.toISOString\(\)\}`;/);
});

test("every errorTest translation key exists in both languages", () => {
  const keys = [...new Set([...panel.matchAll(/"(errorTest\.[^"]+)"/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 7, "expected the panel to use errorTest.* keys");
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  for (const key of keys) {
    assert.ok(translations.slice(0, enStart).includes(`"${key}":`), `th missing ${key}`);
    assert.ok(translations.slice(enStart).includes(`"${key}":`), `en missing ${key}`);
  }
});
