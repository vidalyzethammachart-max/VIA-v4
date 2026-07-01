import { Link } from "react-router-dom";

import Logo from "../assets/logo.png";
import ProfileDropdown from "./ProfileDropdown";
import { useTheme } from "../theme/useTheme";
import { useLanguage } from "../i18n/useLanguage";

export default function MainNavbar() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === "dark";

  return (
    <header
      className={`sticky top-0 z-20 border-b backdrop-blur ${
        isDark
          ? "border-slate-800 bg-slate-950/90"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="w-full px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Go to home"
            className="ui-hover-button inline-flex rounded-md"
          >
            <img src={Logo} alt="VIA Logo" className="h-8 w-auto rounded-md" />
          </Link>

          <div className="min-w-0 flex flex-1 flex-col gap-0.5 leading-none">
            <span
              className={`text-xs font-semibold leading-tight ${
                isDark ? "text-white" : "text-primary"
              }`}
            >
              {t("navbar.brand")}
            </span>
            <h1
              className={`text-base font-semibold leading-tight ${
                isDark ? "text-slate-100" : "text-slate-900"
              }`}
            >
              {t("navbar.title")}
            </h1>
            <p
              className={`text-xs leading-tight ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              {t("navbar.subtitle")}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <ProfileDropdown />
          </div>
        </div>
      </div>
    </header>
  );
}
