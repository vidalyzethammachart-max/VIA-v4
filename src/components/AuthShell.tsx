import type { ReactNode } from "react";
import AuthPageControls from "./AuthPageControls";
import LoginTimeline from "./LoginTimeline";
import { useLanguage } from "../i18n/useLanguage";
import "../page/login.css";

import Logo from "../assets/logo_no_bg.png";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

// Shared frame for login, register, forgot and reset password.
export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
  const { t } = useLanguage();

  return (
    <div className="login-root relative min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      <AuthPageControls />

      <aside className="login-stage hidden flex-col justify-between gap-12 p-12 lg:flex xl:p-16">
        <div className="max-w-lg">
          <h2 className="text-3xl leading-snug xl:text-4xl xl:leading-snug">{t("auth.loginHeadline")}</h2>
          <p className="mt-4 text-base leading-relaxed">{t("auth.loginSub")}</p>
        </div>
        <LoginTimeline />
      </aside>

      <main className="flex min-h-screen items-center justify-center px-6 pb-10 pt-24 sm:px-10 lg:pt-10">
        <div className="w-full max-w-sm">
          <img src={Logo} alt="VIA" className="login-logo mb-8 h-auto w-48 sm:w-56" />
          <h1 className="text-2xl leading-snug sm:text-3xl sm:leading-snug">{title}</h1>
          {subtitle && <p className="login-muted mt-1 text-sm leading-relaxed">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
