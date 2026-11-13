import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isAdminRole } from "../supabase/functions/_shared/roleAccess.js";
import { canReadGroupDocument } from "../supabase/functions/_shared/groupDocumentAccess.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("isAdminRole accepts only admin and super_admin", () => {
  for (const role of ["admin", "super_admin"]) assert.equal(isAdminRole(role), true, role);
  for (const role of ["editor", "user", "", null, undefined, "ADMIN", "root", 1, {}]) {
    assert.equal(isAdminRole(role), false, String(role));
  }
});

test("a super admin passes the group document check without any membership", () => {
  const group = { requested_by: "someone-else" };
  assert.equal(canReadGroupDocument({ role: "super_admin", userId: "u", group, sourceCaseIds: ["c"], memberCaseIds: [] }), true);
  assert.equal(canReadGroupDocument({ role: "user", userId: "u", group, sourceCaseIds: ["c"], memberCaseIds: [] }), false);
});

test("edge functions no longer compare the role to admin directly", () => {
  for (const path of [
    "../supabase/functions/_shared/groupDocumentAccess.js",
    "../supabase/functions/document-artifact-url/index.ts",
    "../supabase/functions/admin-user-management/index.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /[Rr]ole\s*[!=]==?\s*['"]admin['"]/, path);
    assert.match(source, /isAdminRole\(/, path);
  }
});
