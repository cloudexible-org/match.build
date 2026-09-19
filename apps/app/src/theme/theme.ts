/**
 * Light, dark, or whatever the device says (prd/phase-1.md is silent on it;
 * matchmakers work from a phone at night).
 *
 * The tokens in `@repo/ui/theme.css` follow the OS by default and are forced
 * with a `.dark` or `.light` class on <html>, so applying a choice is just
 * setting that class. Kept as plain functions: the no-flash script in
 * `index.html` runs the same logic before React exists.
 */

export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "matchmaker-theme";

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

/** The stored choice, or "system" when there is none (or storage is blocked). */
export function readTheme(storage: Pick<Storage, "getItem">): Theme {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** Just the part of an element this needs, so it is testable without a DOM. */
export type ThemeTarget = {
  classList: { toggle(token: string, force: boolean): void };
};

/** Puts the choice on <html>: "system" leaves both classes off. */
export function applyTheme(root: ThemeTarget, theme: Theme) {
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

/** What the next click should switch to: light → dark → system → light. */
export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
}

export const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
