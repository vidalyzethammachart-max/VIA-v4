import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/components/ProfileDropdown.tsx", import.meta.url),
  "utf8",
);

test("links the profile dropdown to video groups, not the removed video cases list", () => {
  assert.match(source, /label=\{t\("videoGroups\.navLabel"\)\}/);
  assert.match(source, /onClick=\{\(\) => closeAndNavigate\("\/video-groups"\)\}/);
  assert.doesNotMatch(source, /closeAndNavigate\("\/video-cases"\)/);
});
