import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "teamclaw-theme";

export type ThemePreference = "light" | "dark" | "system";

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function resolveIsDark(theme: ThemePreference): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return getSystemPrefersDark();
}

function applyDarkClass(isDark: boolean): void {
  if (typeof document === "undefined") return;
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function persistTheme(theme: ThemePreference): void {
  if (typeof window === "undefined") return;
  if (theme === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, theme);
  }
}

interface ThemeContextValue {
  theme: ThemePreference;
  isDark: boolean;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(getStoredTheme);
  const [isDark, setIsDark] = useState(resolveIsDark(theme));

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    const resolved = resolveIsDark(next);
    setIsDark(resolved);
    applyDarkClass(resolved);
    persistTheme(next);
  }, []);

  useEffect(() => {
    applyDarkClass(isDark);
  }, [isDark]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = getSystemPrefersDark();
      setIsDark(resolved);
      applyDarkClass(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, isDark, setTheme }),
    [theme, isDark, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
