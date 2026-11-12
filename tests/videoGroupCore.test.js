import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_TYPES,
  normalizeGroupPart,
  buildVideoGroupIdentity,
  getGroupTypeLabel,
  buildVideoGroupDisplayName,
  validateVideoGroupForm,
} from "../src/services/videoGroupCore.js";

test("group types map stored values to Thai labels", () => {
  assert.deepEqual(
    GROUP_TYPES.map((t) => [t.value, t.label]),
    [["group", "กลุ่ม"], ["round", "รวมรอบ"], ["year_end", "สรุปปลายปี"]],
  );
  assert.equal(getGroupTypeLabel("year_end"), "สรุปปลายปี");
  assert.equal(getGroupTypeLabel("nope"), "");
});

test("normalizeGroupPart trims, lowercases, joins whitespace with dashes, keeps Thai", () => {
  assert.equal(normalizeGroupPart("  A  b "), "a-b");
  assert.equal(normalizeGroupPart("สั่งงาน 1"), "สั่งงาน-1");
  assert.equal(normalizeGroupPart("X.y/Z"), "x.y/z");
});

test("identity ignores case, spacing and padding; empty or invalid parts give empty string", () => {
  assert.equal(
    buildVideoGroupIdentity("001 ", "round", "Round  A"),
    buildVideoGroupIdentity("001", "round", "round a"),
  );
  assert.equal(buildVideoGroupIdentity("1", "round", "x"), ["1", "round", "x"].join("\u0000"));
  assert.notEqual(buildVideoGroupIdentity("1", "round", "group-x"), buildVideoGroupIdentity("1-round", "group", "x"));
  assert.equal(buildVideoGroupIdentity("1", "bogus", "x"), "");
  assert.equal(buildVideoGroupIdentity("", "round", "x"), "");
  assert.equal(buildVideoGroupIdentity("1", "round", "   "), "");
});

test("display name is label plus trimmed subject", () => {
  assert.equal(buildVideoGroupDisplayName("round", " Q1 "), "รวมรอบ Q1");
});

test("validateVideoGroupForm reports each missing field and null when valid", () => {
  const ok = { orderNumber: "001", groupType: "group", subjectName: "A" };
  assert.equal(validateVideoGroupForm(ok), null);
  for (const bad of [
    { ...ok, orderNumber: " " },
    { ...ok, groupType: "" },
    { ...ok, groupType: "bogus" },
    { ...ok, subjectName: "" },
  ]) {
    assert.equal(typeof validateVideoGroupForm(bad), "string");
  }
  const msgs = new Set([
    validateVideoGroupForm({ ...ok, orderNumber: "" }),
    validateVideoGroupForm({ ...ok, groupType: "" }),
    validateVideoGroupForm({ ...ok, subjectName: "" }),
  ]);
  assert.equal(msgs.size, 3);
});
