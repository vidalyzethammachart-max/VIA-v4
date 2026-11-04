import { Link } from "react-router-dom";

import MainNavbar from "../components/MainNavbar";
import StuckEvaluationsPanel from "../components/StuckEvaluationsPanel";
import { useLanguage } from "../i18n/useLanguage";

export default function AdminStuckJobsPage() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{t("admin.stuckPageTitle")}</h1>
          <Link to="/admin" className="btn-secondary">
            {t("admin.title")}
          </Link>
        </div>
        <StuckEvaluationsPanel />
      </main>
    </div>
  );
}
