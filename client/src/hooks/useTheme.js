import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "vantage-theme";
const DARK_CLASS = "dark";
const LIGHT = "light";
const DARK = "dark";

function readStoredTheme() {
  if (typeof window === "undefined") return LIGHT;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === DARK ? DARK : LIGHT;
  } catch {
    return LIGHT;
  }
}

function applyThemeToDocument(next) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (next === DARK) {
    root.classList.add(DARK_CLASS);
  } else {
    root.classList.remove(DARK_CLASS);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    const value = next === DARK ? DARK : LIGHT;
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore storage errors (private mode, quota, etc.) */
    }
    applyThemeToDocument(value);
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === DARK ? LIGHT : DARK);
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}

export default useTheme;
