import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("every role lands on /home after login; admins also when redirected from a forbidden route", () => {
  const login = read("../src/page/Login.tsx");
  assert.match(login, /navigate\("\/home", \{ replace: true \}\)/);
  assert.doesNotMatch(login, /navigate\("\/(admin|form-submit|dashboard)"/);
  const guard = read("../src/components/ProtectedRoute.tsx");
  assert.match(guard, /roleAtLeast\(role, "admin"\)\) return "\/home"/);
});

test("forbidden-route redirect keeps role landing pages and /admin stays reachable from the menu", () => {
  assert.match(read("../src/components/ProtectedRoute.tsx"), /return "\/form-submit"/);
  assert.match(read("../src/components/ProfileDropdown.tsx"), /closeAndNavigate\("\/admin"\)/);
});
