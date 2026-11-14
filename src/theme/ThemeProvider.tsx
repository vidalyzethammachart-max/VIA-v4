import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ThemeContext, type ThemeContextValue, type ThemeMode } from "./themeContext";

// v2: the old key also held a value copied from the OS setting on first visit, so it
// cannot tell a user's choice apart from that default. Everyone starts light once.
const STORAGE_KEY = "via-theme-v2";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Storage blocked: fall back to the default.
  }

  return "light";
}

function saveTheme(theme: ThemeMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (next) => {
        saveTheme(next);
        setThemeState(next);
      },
      toggleTheme: () => {
        const next = theme === "dark" ? "light" : "dark";
        saveTheme(next);
        setThemeState(next);
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
