import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js)$/.test(name) && !/translations\.ts$/.test(name) ? [path] : [];
  });
}

test("no web source compares a role to \"admin\" directly, so super_admin keeps every admin control", () => {
  const offenders = sourceFiles(fileURLToPath(new URL("../src", import.meta.url)))
    .filter((path) => /[!=]==?\s*["']admin["']/.test(readFileSync(path, "utf8")))
    .map((path) => path.split("/src/")[1]);
  assert.deepEqual(offenders, []);
});
