import assert from "node:assert/strict";
import test from "node:test";
import { installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();
const { ROLES, isAppRole, normalizeRole, roleAtLeast } = await import("../src/lib/roles.ts");

// UC-22: route guards rely on roleAtLeast; UC-02: default role is "user".
test("UC-22 roleAtLeast follows user < editor < admin for every pair", () => {
  const expected = {
    "user,user": true, "user,editor": false, "user,admin": false,
    "editor,user": true, "editor,editor": true, "editor,admin": false,
    "admin,user": true, "admin,editor": true, "admin,admin": true,
  };
  for (const current of ROLES) {
    for (const required of ROLES) {
      assert.equal(roleAtLeast(current, required), expected[`${current},${required}`], `${current} vs ${required}`);
    }
  }
});

test("UC-22 normalizeRole falls back to user for unknown or malformed values", () => {
  for (const bad of [null, undefined, "", "ADMIN", "root", 1, {}, ["admin"]]) {
    assert.equal(normalizeRole(bad), "user");
  }
  for (const good of ROLES) assert.equal(normalizeRole(good), good);
});

test("UC-22 isAppRole accepts only the three known roles", () => {
  assert.deepEqual([...ROLES], ["user", "editor", "admin"]);
  assert.equal(isAppRole("editor"), true);
  assert.equal(isAppRole("Editor"), false);
  assert.equal(isAppRole(undefined), false);
});

test("UC-07 a plain user cannot reach the editor-only form route", () => {
  assert.equal(roleAtLeast(normalizeRole("user"), "editor"), false);
  assert.equal(roleAtLeast(normalizeRole("editor"), "editor"), true);
  assert.equal(roleAtLeast(normalizeRole("admin"), "editor"), true);
});
