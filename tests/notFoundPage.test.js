import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("unknown paths render the not-found page with a link home", () => {
  const app = read("../src/App.tsx");
  assert.match(app, /<Route path="\*" element=\{<NotFoundPage \/>\} \/>\s*<\/Routes>/);
  const page = read("../src/page/NotFoundPage.tsx");
  assert.match(page, /<Link\s+to="\/"/);
  const translations = read("../src/i18n/translations.ts");
  assert.match(translations, /"notFound\.title": "Sorry, this page is not available"/);
  assert.match(translations, /"notFound\.backHome": "กลับไปหน้าแรก"/);
});
