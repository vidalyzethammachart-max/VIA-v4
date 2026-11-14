import { useState } from "react";

import ErrorNoticeModal from "./ErrorNoticeModal";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabaseClient";
import { reportError } from "../services/errorReporter";

// Unique per click: identical errors are only logged once a minute.
function testMessage(kind: string): string {
  return `[TEST] ${kind} ${new Date().toISOString()}`;
}

function CrashOnRender({ message }: { message: string }): never {
  throw new Error(message);
}

// Super admin only (rendered on the error log page): raises one error per source so the
// log and the popup can be checked end to end.
export default function ErrorTestPanel() {
  const { t } = useLanguage();
  const [popupDetail, setPopupDetail] = useState<string | null>(null);
  const [crashMessage, setCrashMessage] = useState<string | null>(null);

  const triggers: Array<{ key: string; run: () => void }> = [
    {
      key: "errorTest.popup",
      run: () => {
        const message = testMessage("popup");
        reportError(new Error(message), { source: "popup", context: { action: "error_test" } });
        setPopupDetail(message);
      },
    },
    {
      key: "errorTest.windowError",
      run: () => {
        const message = testMessage("window_error");
        setTimeout(() => {
          throw new Error(message);
        });
      },
    },
    {
      key: "errorTest.rejection",
      run: () => {
        void Promise.reject(new Error(testMessage("unhandled_rejection")));
      },
    },
    {
      key: "errorTest.network",
      run: () => {
        // The builder is lazy: .then() is what sends the request. The 400 is logged by the fetch wrapper.
        void supabase.from("video_group_evaluations").select("id").eq("id", "not-a-uuid").then(() => undefined);
      },
    },
    {
      key: "errorTest.react",
      run: () => setCrashMessage(testMessage("react")),
    },
  ];

  return (
    <section className="ui-hover-card space-y-3 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
      <ErrorNoticeModal isOpen={popupDetail !== null} detail={popupDetail} onClose={() => setPopupDetail(null)} />
      {crashMessage && <CrashOnRender message={crashMessage} />}
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{t("errorTest.title")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("errorTest.hint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {triggers.map((trigger) => (
          <button
            key={trigger.key}
            type="button"
            className="btn-secondary rounded-full px-4 py-1.5 text-xs"
            onClick={trigger.run}
          >
            {t(trigger.key)}
          </button>
        ))}
      </div>
    </section>
  );
}
