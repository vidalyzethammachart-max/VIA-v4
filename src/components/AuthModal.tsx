import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "../i18n/useLanguage";

type AuthModalProps = {
  title?: string;
  message: string;
  onClose: () => void;
};

export default function AuthModal({ title, message, onClose }: AuthModalProps) {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-20"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="w-full max-w-md rounded-3xl border border-slate-200 bg-white px-5 py-6 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <h3 className="text-[1.7rem] font-bold leading-none">{title ?? t("common.confirm")}</h3>
          <p className="mt-5 text-base leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
          <div className="mt-8 flex justify-end">
            <button type="button" onClick={onClose} className="btn-primary min-w-20 rounded-full px-7 py-2 text-base font-semibold">
              {t("common.ok")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
