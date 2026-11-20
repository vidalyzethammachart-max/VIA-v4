import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the evaluation delete popups do not mention Supabase or that it cannot be undone", () => {
  const translations = read("../src/i18n/translations.ts");
  const messages = [...translations.matchAll(/"myForms\.deleteMessage":\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  assert.equal(messages.length, 2, "one message per language");
  for (const message of messages) {
    assert.match(message, /\{label\}/);
    assert.doesNotMatch(message, /Supabase|ย้อนกลับ|กู้คืน|undone/i);
  }

  const casePage = read("../src/page/VideoCaseDetailPage.tsx");
  const caseMessage = casePage.match(/message=\{`([^`]*evaluationToDelete[^`]*)`\}/);
  assert.ok(caseMessage, "case page delete popup message not found");
  assert.doesNotMatch(caseMessage[1], /กู้คืน|ย้อนกลับ/);
});
