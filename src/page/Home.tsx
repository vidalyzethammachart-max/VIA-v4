import { Link } from "react-router-dom";

import LoginTimeline from "../components/LoginTimeline";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import "./login.css";
import "./dashboard.css";

export default function Home() {
  const { t, language } = useLanguage();

  return (
    <div className="db-root">
      <MainNavbar />

      <main className="mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-7xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:px-8">
        <section>
          <h1 className="max-w-2xl text-3xl font-bold leading-snug sm:text-4xl sm:leading-snug lg:text-5xl lg:leading-snug">
            {t("navbar.title")}
          </h1>
          <p className="db-link mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">
            {t("navbar.subtitle")}
          </p>
          <p className="db-muted mt-5 max-w-xl text-base leading-relaxed">
            {t("home.heroDescription")}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/form-submit" className="btn-primary min-h-12 px-6 py-3">
              {t("home.startEvaluation")}
            </Link>
            <Link to="/dashboard" className="btn-secondary min-h-12 px-6 py-3">
              {t("home.viewResults")}
            </Link>
            <Link to="/video-cases" className="db-link rounded px-2 py-3 text-center text-sm">
              {language === "th" ? "จัดการกลุ่มวิดีโอ" : "Video cases"}
            </Link>
          </div>
        </section>

        <section className="db-stage hidden lg:block" aria-hidden="true">
          <p className="db-stage-muted mb-6 max-w-sm text-sm leading-relaxed">{t("auth.loginSub")}</p>
          <LoginTimeline />
        </section>
      </main>
    </div>
  );
}
