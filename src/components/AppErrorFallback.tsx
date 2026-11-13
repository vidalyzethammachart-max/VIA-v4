import { useLanguage } from "../i18n/useLanguage";

export default function AppErrorFallback() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">{t("common.errorOccurred")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("common.errorReportingNotice")}</p>
        <button
          type="button"
          className="btn-primary mt-5 rounded-full px-6 py-2 text-sm"
          onClick={() => window.location.reload()}
        >
          {t("common.reload")}
        </button>
      </div>
    </div>
  );
}
