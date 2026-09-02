import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/components/ProfileDropdown.tsx", import.meta.url),
  "utf8",
);

test("adds a video case shortcut to the profile dropdown", () => {
  assert.match(
    source,
    /label=\{language === "th" \? "กลุ่มวิดีโอ" : "Video cases"\}/,
  );
  assert.match(source, /onClick=\{\(\) => closeAndNavigate\("\/video-cases"\)\}/);
});
