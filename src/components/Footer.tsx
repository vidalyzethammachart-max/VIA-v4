import { useLanguage } from "../i18n/useLanguage";
import { useTheme } from "../theme/useTheme";

export default function Footer() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === "dark";

  return (
    <footer
      className={`${isDark ? "bg-slate-950 text-slate-100" : "bg-[#04418b] text-white"} mt-auto transition-colors`}
    >
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h3 className="mb-4 text-lg font-bold">{t("footer.title")}</h3>
            <p className={`text-sm font-bold leading-relaxed ${isDark ? "text-slate-300" : "text-gray-300"}`}>
              {t("footer.desc1")}
            </p>
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-gray-300"}`}>
              {t("footer.desc2")}
            </p>
          </div>

          <div />

          <div>
            <h3 className="mb-4 text-lg font-bold">{t("footer.contact")}</h3>
            <ul className={`space-y-2 text-sm ${isDark ? "text-slate-300" : "text-gray-300"}`}>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
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
                      d="M12 21s-6-4.35-6-10a6 6 0 1112 0c0 5.65-6 10-6 10z"
                    />
                    <circle cx="12" cy="11" r="2.25" />
                  </svg>
                </span>
                <span>
                  {t("footer.organization")}
                  <br />
                  {t("footer.addressLine1")}
                  <br />
                  {t("footer.addressLine2")}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
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
                      d="M22 16.92v2a2 2 0 01-2.18 2 19.86 19.86 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.86 19.86 0 012.11 3.18 2 2 0 014.1 1h2a2 2 0 012 1.72c.12.9.34 1.78.65 2.62a2 2 0 01-.45 2.11L7.09 8.91a16 16 0 006 6l1.46-1.21a2 2 0 012.11-.45c.84.31 1.72.53 2.62.65A2 2 0 0122 16.92z"
                    />
                  </svg>
                </span>
                <span>{t("footer.phone")}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
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
                      d="M4 6h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M22 8l-10 7L2 8" />
                  </svg>
                </span>
                <a href="mailto:info@via.ac.th">{t("footer.email")}</a>
              </li>
            </ul>
          </div>
        </div>

        <div className={`mt-8 border-t pt-8 ${isDark ? "border-slate-800" : "border-white/20"}`}>
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex gap-4">
              {[
                ["https://muic.mahidol.ac.th/th/", "Website"],
                ["https://web.facebook.com/mahidol.inter?_rdc=1&_rdr#", "Facebook"],
                ["https://line.me/ti/p/~@MUICfriend", "LINE"],
              ].map(([href, label]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${isDark ? "bg-slate-800" : "bg-white/10"}`}
                  aria-label={label}
                >
                  {label === "Facebook" && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.2c0-.9.3-1.5 1.6-1.5H16.8V5c-.3 0-1.3-.1-2.5-.1-2.5 0-4.3 1.5-4.3 4.4V11H7.2v3H10v8h3.5z" />
                    </svg>
                  )}
                  {label === "Website" && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a15 15 0 010 18" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a15 15 0 000 18" />
                    </svg>
                  )}
                  {label === "LINE" && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 3C6.5 3 2 6.7 2 11.3c0 4.1 3.5 7.5 8.2 8.1l-.6 2.4c-.1.3.2.6.5.4l2.9-2c5-.1 9-3.5 9-8.3C22 6.7 17.5 3 12 3zm-4 9.6H6.5V9.1c0-.3.2-.5.5-.5s.5.2.5.5v3h1c.3 0 .5.2.5.5s-.2.5-.5.5zm2-3.5v3.9c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9.1c0-.3.2-.5.5-.5s.5.2.5.5zm4.3 0v3.9c0 .2-.1.4-.3.5h-.2c-.2 0-.3-.1-.4-.2l-2-2.6v2.3c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9.1c0-.2.1-.4.3-.5h.2c.2 0 .3.1.4.2l2 2.6V9.1c0-.3.2-.5.5-.5s.5.2.5.5zm3.2.5h-1.5v.8h1.5c.3 0 .5.2.5.5s-.2.5-.5.5h-1.5v.8h1.5c.3 0 .5.2.5.5s-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5V9.1c0-.3.2-.5.5-.5h2c.3 0 .5.2.5.5s-.2.5-.5.5z" />
                    </svg>
                  )}
                </a>
              ))}
            </div>

            <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-300"}`}>
              {t("footer.rights", { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
