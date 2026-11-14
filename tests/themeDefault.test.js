import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/theme/ThemeProvider.tsx", import.meta.url), "utf8");

test("the theme starts light unless the user picked one, regardless of the OS setting", () => {
  assert.doesNotMatch(source, /prefers-color-scheme/);
  const initial = source.slice(source.indexOf("function getInitialTheme"), source.indexOf("function saveTheme"));
  assert.match(initial, /return "light";\s*}\s*$/);
});

test("a new storage key drops the OS-derived dark value saved under the old key", () => {
  assert.match(source, /const STORAGE_KEY = "via-theme-v2";/);
});

test("the theme is saved only when the user changes it, not on first render", () => {
  assert.doesNotMatch(source, /useEffect\([\s\S]*?localStorage\.setItem[\s\S]*?\}, \[theme\]\)/);
  assert.match(source, /function saveTheme\(/);
});
