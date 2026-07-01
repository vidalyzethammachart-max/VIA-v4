import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "../i18n/useLanguage";

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  variant?: "danger" | "primary";
};

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  confirmDisabled = false,
  variant = "danger",
}: ConfirmModalProps) {
  const { t } = useLanguage();
  const isPrimary = variant === "primary";

  useEffect(() => {
    if (!isOpen || confirmDisabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDisabled, isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm dark:bg-slate-950/70"
          onClick={() => {
            if (!confirmDisabled) onCancel();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-message"
          >
            <div className={`px-6 py-7 ${isPrimary ? "bg-[#04418b]/10 dark:bg-[#04418b]/20" : "bg-red-100 dark:bg-red-950/40"}`}>
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white shadow-sm ${
                  isPrimary ? "bg-[#04418b] dark:bg-[#04418b]" : "bg-red-500 dark:bg-red-500/90"
                }`}
              >
                <svg className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  {isPrimary ? (
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-10.75a.75.75 0 00-1.5 0v4.25a.75.75 0 001.5 0V7.25zm0 7a.75.75 0 00-1.5 0v.25a.75.75 0 001.5 0v-.25z"
                      clipRule="evenodd"
                    />
                  ) : (
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-10.75a.75.75 0 00-1.5 0v4.25a.75.75 0 001.5 0V7.25zm0 7a.75.75 0 00-1.5 0v.25a.75.75 0 001.5 0v-.25z"
                      clipRule="evenodd"
                    />
                  )}
                </svg>
              </div>
            </div>

            <div className="px-6 pb-6 pt-5">
              <h2 id="confirm-modal-title" className="text-center text-xl font-bold text-slate-900 dark:text-slate-100">
                {title}
              </h2>
              <p id="confirm-modal-message" className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
                {message}
              </p>

              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={confirmDisabled}
                  className="btn-secondary rounded-full px-5 py-2.5 text-sm font-medium"
                >
                  {cancelLabel ?? t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={confirmDisabled}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold ${
                    isPrimary
                      ? "btn-primary disabled:bg-slate-400 dark:disabled:bg-slate-700"
                      : "btn-danger disabled:bg-red-300 dark:disabled:bg-red-900/40"
                  }`}
                >
                  {confirmDisabled ? t("common.processing") : confirmLabel ?? t("common.confirm")}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
