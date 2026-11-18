import { Link } from "react-router-dom";

import Logo from "../assets/logo_no_bg.png";
import { useLanguage } from "../i18n/useLanguage";

export default function NotFoundPage() {
  const { t } = useLanguage();

  return (
    <main className="flex min-h-[calc(100vh-96px)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <img src={Logo} alt="" className="mx-auto h-16 w-auto" />
        <p className="mt-6 text-5xl font-bold text-[#04418b] dark:text-sky-300">404</p>
        <h1 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t("notFound.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("notFound.description")}</p>
        <Link
          to="/"
          className="ui-hover-button mt-8 inline-flex min-h-12 items-center justify-center rounded-lg border border-[#04418b] bg-[#04418b] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#03326a]"
        >
          {t("notFound.backHome")}
        </Link>
      </div>
    </main>
  );
}
