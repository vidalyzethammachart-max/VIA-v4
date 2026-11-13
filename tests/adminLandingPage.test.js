import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("admins land on /home after login and when redirected from a forbidden route", () => {
  const login = read("../src/page/Login.tsx");
  assert.match(login, /roleAtLeast\(role, "admin"\)\) \{\s*navigate\("\/home", \{ replace: true \}\)/);
  assert.doesNotMatch(login, /navigate\("\/admin"/);
  const guard = read("../src/components/ProtectedRoute.tsx");
  assert.match(guard, /roleAtLeast\(role, "admin"\)\) return "\/home"/);
});

test("editors and users keep their own landing pages and /admin stays reachable from the menu", () => {
  const login = read("../src/page/Login.tsx");
  assert.match(login, /roleAtLeast\(role, "editor"\)\) \{\s*navigate\("\/form-submit"/);
  assert.match(read("../src/components/ProtectedRoute.tsx"), /return "\/form-submit"/);
  assert.match(read("../src/components/ProfileDropdown.tsx"), /closeAndNavigate\("\/admin"\)/);
});
