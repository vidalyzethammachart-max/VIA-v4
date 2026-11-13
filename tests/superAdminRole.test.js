import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();
const { ASSIGNABLE_ROLES } = await import("../src/lib/roles.ts");

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("super_admin cannot be assigned from any role picker", () => {
  assert.deepEqual([...ASSIGNABLE_ROLES], ["user", "editor", "admin"]);
  const dashboard = read("../src/page/AdminDashboard.tsx");
  assert.match(dashboard, /ASSIGNABLE_ROLES/);
  assert.doesNotMatch(dashboard, /<option value="super_admin"/);
});

test("web role checks treat super_admin as an admin through roleAtLeast", () => {
  for (const path of ["../src/services/videoCaseEditing.ts", "../src/services/videoCaseService.ts"]) {
    const source = read(path);
    assert.doesNotMatch(source, /normalizeRole\([^)]*\)\s*[!=]==\s*"admin"/, path);
    assert.match(source, /roleAtLeast\(normalizeRole\([^)]*\),\s*"admin"\)/, path);
  }
});
