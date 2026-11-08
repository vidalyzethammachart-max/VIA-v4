import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { accountingService } from "../services/accountingService";
import AuthAlert from "../components/AuthAlert";
import AuthShell from "../components/AuthShell";
import { useLanguage } from "../i18n/useLanguage";
import {
  getPasswordResetRequestErrorMessage,
  RESET_EMAIL_COOLDOWN_MS,
} from "../utils/passwordReset";

export default function ForgotPassword() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string }>({});
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const navigate = useNavigate();

  const isCoolingDown = cooldownUntil !== null && cooldownUntil > Date.now();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isCoolingDown) return;

    const normalizedEmail = email.trim().toLowerCase();
    const nextFieldErrors: { email?: string } = {};

    if (!normalizedEmail) {
      nextFieldErrors.email = t("form.fillField");
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(getPasswordResetRequestErrorMessage());
        return;
      }

      setCooldownUntil(Date.now() + RESET_EMAIL_COOLDOWN_MS);
      setMessage(t("auth.resetEmailSentGeneric"));

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.email?.toLowerCase() === normalizedEmail) {
        void accountingService
          .logActivity({
            user_id: user.id,
            action: "REQUEST_PASSWORD_RESET",
            resource: "auth",
            metadata: { email: normalizedEmail },
          })
          .catch((logError) => {
            console.error("Activity log failed:", logError);
          });
      }
    } catch {
      setError(getPasswordResetRequestErrorMessage());
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t("auth.forgotPasswordTitle")} subtitle={t("auth.forgotPasswordSubtitle")}>
          {message && <AuthAlert variant="success" message={message} />}
          {error && <AuthAlert variant="error" message={error} />}
          {isCoolingDown && !error && <AuthAlert variant="info" message={t("auth.resetCooldown")} />}

          <form noValidate onSubmit={handleReset} className="mt-5 space-y-5">
            <div>
              <label htmlFor="auth-field-1" className="login-label">
                {t("auth.email")}
              </label>
              <input
 id="auth-field-1"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (message) setMessage("");
                  if (error) setError("");
                  if (fieldErrors.email) {
                    setFieldErrors((current) => ({ ...current, email: undefined }));
                  }
                }}
                disabled={loading}
                aria-invalid={fieldErrors.email ? true : undefined}
                  className="login-input disabled:opacity-70"
                placeholder={t("auth.enterEmail")}
                autoComplete="email"
                required
              />
              {fieldErrors.email && (
                <p className="mt-2 text-sm text-red-500 dark:text-red-400">{fieldErrors.email}</p>
              )}
            </div>

            <button type="submit" disabled={loading || isCoolingDown} className="btn-primary w-full rounded-lg py-2">
              {loading ? t("auth.sending") : t("auth.sendResetLink")}
            </button>
            <button
              type="button"
              className="btn-secondary w-full rounded-lg py-2"
              onClick={() => navigate("/")}
            >
              {t("auth.backToLogin")}
            </button>
          </form>
    </AuthShell>
  );
}
