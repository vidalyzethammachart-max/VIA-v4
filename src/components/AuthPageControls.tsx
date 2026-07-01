import { useLanguage } from "../i18n/useLanguage";
import { useTheme } from "../theme/useTheme";

export default function AuthPageControls() {
  const { language, toggleLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
      <button
        type="button"
        onClick={toggleLanguage}
        className="btn-secondary rounded-full px-3 py-2 text-xs font-semibold sm:text-sm"
        aria-label={t("common.language")}
      >
        {language === "th" ? "TH" : "EN"}
      </button>

      <button
        type="button"
        onClick={toggleTheme}
        className="btn-secondary inline-flex h-10 w-10 items-center justify-center rounded-full p-0"
        aria-label={isDark ? t("common.lightMode") : t("common.darkMode")}
        title={isDark ? t("common.lightMode") : t("common.darkMode")}
      >
        {isDark ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v2.25M12 18.75V21M4.97 4.97l1.59 1.59M17.44 17.44l1.59 1.59M3 12h2.25M18.75 12H21M4.97 19.03l1.59-1.59M17.44 6.56l1.59-1.59M15.75 12A3.75 3.75 0 1112 8.25 3.75 3.75 0 0115.75 12z"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12.79A9 9 0 1111.21 3c-.08.56-.12 1.13-.12 1.71a9 9 0 009.91 8.08z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
