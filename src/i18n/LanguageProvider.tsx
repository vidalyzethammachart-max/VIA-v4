import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { translations, type Locale } from "./translations";
import { LanguageContext, type LanguageContextValue } from "./languageContext";

const STORAGE_KEY = "via-language";

function getInitialLanguage(): Locale {
  if (typeof window === "undefined") {
    return "th";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "th" || stored === "en") {
    return stored;
  }

  const browserLanguage = window.navigator.language.toLowerCase();
  return browserLanguage.startsWith("th") ? "th" : "en";
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Locale>(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
      toggleLanguage: () => setLanguageState((current) => (current === "th" ? "en" : "th")),
      t: (key, vars) => {
        const template =
          translations[language][key] ??
          translations.en[key] ??
          key;
        return interpolate(template, vars);
      },
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
