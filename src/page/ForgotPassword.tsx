import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import Logo from "../assets/logo_no_bg.png";
import { accountingService } from "../services/accountingService";
import AuthAlert from "../components/AuthAlert";
import AuthPageControls from "../components/AuthPageControls";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#f7f9fb] px-3 pb-4 pt-20 dark:bg-slate-950 sm:px-4 sm:py-6">
      <AuthPageControls />
      <div className="relative z-10 flex w-full max-w-md items-center justify-center rounded-2xl border-2 border-[#eaeef2] bg-white px-3 py-6 dark:border-slate-800 dark:bg-slate-900 sm:border-4 sm:px-4 sm:py-10">
        <div className="relative z-10 w-full rounded-2xl px-4 py-5 sm:p-8">
          <div className="flex justify-center p-1 sm:p-2">
            <img src={Logo} alt="Logo" className="h-auto w-full max-w-[260px] sm:max-w-[340px]" />
          </div>
          <div>
            <h2 className="mb-3 text-center text-xl font-bold text-black dark:text-white sm:mb-4 sm:text-2xl">
              {t("auth.loginTitle")}
            </h2>
            <p className="mb-1 text-center text-base font-semibold text-slate-800 dark:text-slate-100">
              {t("auth.forgotPasswordTitle")}
            </p>
            <p className="mb-6 text-center text-sm text-gray-500 dark:text-slate-400">
              {t("auth.forgotPasswordSubtitle")}
            </p>
          </div>

          {message && <AuthAlert variant="success" message={message} />}
          {error && <AuthAlert variant="error" message={error} />}
          {isCoolingDown && !error && <AuthAlert variant="info" message={t("auth.resetCooldown")} />}

          <form noValidate onSubmit={handleReset} className="space-y-4 sm:space-y-5">
            <div>
              <label className="mb-1 block font-medium text-gray-600 dark:text-slate-300">
                {t("auth.email")}
              </label>
              <input
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
                className={`w-full rounded-lg border bg-white px-4 py-2 text-black focus:outline-none focus:ring-1 dark:bg-slate-950 dark:text-white ${
                  fieldErrors.email
                    ? "border-red-400 focus:ring-red-200 dark:border-red-500/60"
                    : "border-gray-500 focus:ring-[#04418b] dark:border-slate-700"
                }`}
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
        </div>
      </div>
    </div>
  );
}
