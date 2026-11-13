import { Component, type ErrorInfo, type ReactNode } from "react";

import { useLanguage } from "../i18n/useLanguage";
import { reportError } from "../services/errorReporter";

function ErrorFallback() {
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

type State = { failed: boolean };

// Catches render crashes anywhere below it, reports them, and shows a plain fallback.
// Error boundaries must be class components, which the fast-refresh rule cannot recognise.
// eslint-disable-next-line react-refresh/only-export-components
export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { source: "react", context: { componentStack: info.componentStack } });
  }

  render() {
    return this.state.failed ? <ErrorFallback /> : this.props.children;
  }
}
