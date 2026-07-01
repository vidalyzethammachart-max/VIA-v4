export const MIN_PASSWORD_LENGTH = 8;
export const RESET_EMAIL_COOLDOWN_MS = 30_000;
export const RECOVERY_SESSION_WAIT_MS = 1500;
export const PASSWORD_RESET_RECOVERY_KEY = "via-password-reset-recovery";
export const PASSWORD_UPDATE_TIMEOUT_MS = 10_000;

export type PasswordResetFieldErrors = {
  password?: "required" | "too_short";
  confirmPassword?: "required" | "mismatch";
};

export function hasRecoveryParams(currentUrl = new URL(window.location.href)): boolean {
  const searchParams = currentUrl.searchParams;
  const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
  const malformedRecoveryToken = currentUrl.search.includes("?token_hash=");

  return (
    searchParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery" ||
    searchParams.has("code") ||
    searchParams.has("token_hash") ||
    malformedRecoveryToken ||
    hashParams.has("token_hash") ||
    (hashParams.has("access_token") && hashParams.has("refresh_token")) ||
    (searchParams.has("access_token") && searchParams.has("refresh_token"))
  );
}

export function validatePasswordReset(
  password: string,
  confirmPassword: string,
): PasswordResetFieldErrors {
  const errors: PasswordResetFieldErrors = {};

  if (!password.trim()) {
    errors.password = "required";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = "too_short";
  }

  if (!confirmPassword.trim()) {
    errors.confirmPassword = "required";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "mismatch";
  }

  return errors;
}

export function getPasswordResetRequestErrorMessage(): string {
  return "Unable to send reset email right now. Please try again in a moment.";
}

export function getPasswordUpdateErrorMessage(message?: string): string {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("session_not_found") ||
    normalizedMessage.includes("session expired") ||
    normalizedMessage.includes("jwt expired") ||
    normalizedMessage.includes("invalid refresh token")
  ) {
    return "This reset link is invalid or expired. Request a new password reset email.";
  }

  if (normalizedMessage.includes("same password")) {
    return "Choose a new password that is different from your current password.";
  }

  if (normalizedMessage.includes("timeout")) {
    return "The password update is taking too long. Please try again or request a new reset link.";
  }

  if (normalizedMessage.includes("password")) {
    return message ?? "Unable to update password. Please check your password requirements.";
  }

  return "Unable to update password right now. Please try requesting a new reset link.";
}
