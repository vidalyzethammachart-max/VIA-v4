import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useLanguage } from "../i18n/useLanguage";

type ErrorNoticeModalProps = {
  isOpen: boolean;
  // Technical detail of the failure, shown small under the notice to help whoever investigates.
  detail?: string | null;
  onClose: () => void;
};

// Popup for an unexpected failure of a user action. Same look as ConfirmModal, a single "OK" action.
export default function ErrorNoticeModal({ isOpen, detail, onClose }: ErrorNoticeModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm dark:bg-slate-950/70"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="error-notice-title"
            aria-describedby="error-notice-message"
          >
            <div className="bg-red-100 px-6 py-7 dark:bg-red-950/40">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-sm dark:bg-red-500/90">
                <svg className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-10.75a.75.75 0 00-1.5 0v4.25a.75.75 0 001.5 0V7.25zm0 7a.75.75 0 00-1.5 0v.25a.75.75 0 001.5 0v-.25z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
            <div className="px-6 pb-6 pt-5">
              <h2 id="error-notice-title" className="text-center text-xl font-bold text-slate-900 dark:text-slate-100">
                {t("common.errorOccurred")}
              </h2>
              <p id="error-notice-message" className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
                {t("common.errorReportingNotice")}
              </p>
              {detail && (
                <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {detail}
                </p>
              )}
              <div className="mt-6 flex justify-center">
                <button type="button" onClick={onClose} className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold">
                  {t("common.ok")}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
