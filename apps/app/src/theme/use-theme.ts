import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  nextTheme,
  readTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "./theme";

/**
 * The current theme choice and a way to change it. The choice is stored per
 * browser; "system" follows the device, including when it changes while the
 * app is open (a phone switching at sunset).
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycle: () => void;
} {
  const [theme, setStored] = useState<Theme>(() =>
    readTheme(window.localStorage),
  );

  useEffect(() => {
    applyTheme(document.documentElement, theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Private windows and blocked storage: the choice just won't persist.
    }
  }, [theme]);

  // Following the OS needs no work — the tokens do it — but re-render so the
  // control's label keeps up.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const rerender = () => setStored("system");
    media.addEventListener("change", rerender);
    return () => media.removeEventListener("change", rerender);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setStored(next), []);
  const cycle = useCallback(
    () => setStored((current) => nextTheme(current)),
    [],
  );
  return { theme, setTheme, cycle };
}
