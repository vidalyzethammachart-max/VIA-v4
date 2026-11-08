import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { accountingService } from "../services/accountingService";
import { getUserRole } from "../hooks/useAuthRole";
import { normalizeRole, roleAtLeast } from "../lib/roles";
import AuthShell from "../components/AuthShell";
import { useLanguage } from "../i18n/useLanguage";


export default function Login() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      nextFieldErrors.email = t("form.fillField");
    }
    if (!password.trim()) {
      nextFieldErrors.password = t("form.fillField");
    }
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(t("auth.invalidLogin"));
      setLoading(false);
      return;
    }

    if (data.user) {
      const role = normalizeRole(
        await getUserRole(data.user.id).catch((roleError) => {
          console.error("Failed to load role after login:", roleError);
          return "user";
        }),
      );

      void accountingService
        .logActivity({
          user_id: data.user.id,
          action: "auth.login_success",
          resource: "auth",
        })
        .catch((logError) => {
          console.error("Activity log failed:", logError);
        });

      setLoading(false);

      if (roleAtLeast(role, "admin")) {
        navigate("/admin", { replace: true });
        return;
      }

      if (roleAtLeast(role, "editor")) {
        navigate("/form-submit", { replace: true });
        return;
      }

      navigate("/dashboard", { replace: true });
      return;
    }

    setLoading(false);
    navigate("/dashboard", { replace: true });
  };

  const EyeIcon = showPassword ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
  );

  return (
    <AuthShell title={t("auth.login")} subtitle={t("auth.loginTitle")}>
          <form noValidate onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="login-label">{t("auth.email")}</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
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
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{fieldErrors.email}</p>
              )}
            </div>
            <div>
              <label htmlFor="login-password" className="login-label">{t("auth.password")}</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                    if (fieldErrors.password) {
                      setFieldErrors((current) => ({ ...current, password: undefined }));
                    }
                  }}
                  disabled={loading}
                  aria-invalid={fieldErrors.password || errorMessage ? true : undefined}
                  className="login-input pr-11 disabled:opacity-70"
                  placeholder={t("auth.enterPassword")}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  title={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  className="login-muted absolute inset-y-0 right-0 flex items-center rounded-lg px-3"
                >
                  {EyeIcon}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{fieldErrors.password}</p>
              )}
              {errorMessage && (
                <div
                  className="mt-2 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300"
                  role="alert"
                >
                  <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M18 10A8 8 0 114.343 4.343 8 8 0 0118 10zm-8.75-3.5a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm0 6.5a.75.75 0 011.5 0V13a.75.75 0 01-1.5 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
            <div className="space-y-3 pt-1">
              <button type="submit" disabled={loading} className="btn-primary w-full rounded-lg py-2.5">
                {loading ? t("auth.loggingIn") : t("auth.login")}
              </button>
              <button
                type="button"
                disabled={loading}
                className="btn-secondary w-full rounded-lg py-2.5"
                onClick={() => navigate("/register")}
              >
                {t("auth.register")}
              </button>
            </div>
            <div>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                disabled={loading}
                className="login-link rounded text-sm disabled:opacity-60"
              >
                {t("auth.forgotPassword")}
              </button>
            </div>
          </form>
    </AuthShell>
  );
}
