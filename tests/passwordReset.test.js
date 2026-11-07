import assert from "node:assert/strict";
import test from "node:test";
import { installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();
const m = await import("../src/utils/passwordReset.ts");

// UC-03: forgot / reset password.
test("UC-03 validatePasswordReset accepts matching passwords of 8+ characters", () => {
  assert.deepEqual(m.validatePasswordReset("abcdefgh", "abcdefgh"), {});
});

test("UC-03 validatePasswordReset reports required, too_short and mismatch", () => {
  assert.deepEqual(m.validatePasswordReset("", ""), { password: "required", confirmPassword: "required" });
  assert.deepEqual(m.validatePasswordReset("   ", "   "), { password: "required", confirmPassword: "required" });
  assert.equal(m.validatePasswordReset("short", "short").password, "too_short");
  assert.equal(m.validatePasswordReset("abcdefgh", "abcdefgi").confirmPassword, "mismatch");
  assert.equal(m.MIN_PASSWORD_LENGTH, 8);
});

test("UC-03 hasRecoveryParams recognises recovery links and ignores normal URLs", () => {
  const yes = [
    "https://x.test/reset-password?type=recovery",
    "https://x.test/reset-password#type=recovery",
    "https://x.test/reset-password?code=abc",
    "https://x.test/reset-password?token_hash=abc",
    "https://x.test/reset-password?type=recovery?token_hash=abc",
    "https://x.test/reset-password#access_token=a&refresh_token=b",
  ];
  for (const url of yes) assert.equal(m.hasRecoveryParams(new URL(url)), true, url);
  for (const url of ["https://x.test/reset-password", "https://x.test/reset-password#access_token=a"]) {
    assert.equal(m.hasRecoveryParams(new URL(url)), false, url);
  }
});

test("UC-03 expired links and slow updates map to user-facing messages", () => {
  assert.match(m.getPasswordUpdateErrorMessage("JWT expired"), /invalid or expired/);
  assert.match(m.getPasswordUpdateErrorMessage("session_not_found"), /invalid or expired/);
  assert.match(m.getPasswordUpdateErrorMessage("New password should be different from the same password"), /different/);
  assert.match(m.getPasswordUpdateErrorMessage("request timeout"), /taking too long/);
  assert.match(m.getPasswordUpdateErrorMessage(), /Unable to update password/);
});

test("UC-03 reset request error text does not reveal whether an account exists", () => {
  assert.doesNotMatch(m.getPasswordResetRequestErrorMessage(), /not found|no account|exist/i);
  assert.equal(m.RESET_EMAIL_COOLDOWN_MS, 30_000);
});
