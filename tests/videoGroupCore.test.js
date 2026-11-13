import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_TYPES,
  GROUP_TYPE_MAX_LENGTH,
  resolveGroupType,
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
  // Free text: an unknown type is shown as typed.
  assert.equal(getGroupTypeLabel("ประจำไตรมาส"), "ประจำไตรมาส");
  assert.equal(getGroupTypeLabel(""), "");
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
  assert.equal(buildVideoGroupIdentity("1", "  ", "x"), "");
  // A suggestion label and its stored value are the same group; custom text is its own type.
  assert.equal(buildVideoGroupIdentity("1", "รวมรอบ", "x"), buildVideoGroupIdentity("1", "round", "x"));
  assert.equal(buildVideoGroupIdentity("1", " Q1  Review ", "x"), ["1", "q1-review", "x"].join("\u0000"));
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
    { ...ok, groupType: "x".repeat(GROUP_TYPE_MAX_LENGTH + 1) },
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

test("a custom group type is valid; suggestions resolve to their stored value", () => {
  assert.equal(validateVideoGroupForm({ orderNumber: "1", groupType: "ประจำไตรมาส", subjectName: "A" }), null);
  assert.equal(resolveGroupType(" รวมรอบ "), "round");
  assert.equal(resolveGroupType("Year_End"), "year_end");
  assert.equal(resolveGroupType(" ประจำไตรมาส "), "ประจำไตรมาส");
  assert.equal(resolveGroupType("  "), "");
  assert.equal(buildVideoGroupDisplayName("ประจำไตรมาส", " Q1 "), "ประจำไตรมาส Q1");
});
