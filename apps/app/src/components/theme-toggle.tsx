import { Button } from "@repo/ui";
import { nextTheme, THEME_LABELS } from "../theme/theme";
import { useTheme } from "../theme/use-theme";

/**
 * Cycles light → dark → whatever the device says. One button rather than a
 * menu: it is a three-way choice people flip, not configure, and it has to
 * work at 380px next to the account name.
 */
export function ThemeToggle() {
  const { theme, cycle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycle}
      data-testid="theme-toggle"
      data-theme-choice={theme}
      aria-label={`Theme: ${THEME_LABELS[theme].toLowerCase()}. Switch to ${THEME_LABELS[nextTheme(theme)].toLowerCase()}.`}
      title={`Theme: ${THEME_LABELS[theme]}`}
    >
      <ThemeIcon theme={theme} />
    </Button>
  );
}

function ThemeIcon({ theme }: { theme: "light" | "dark" | "system" }) {
  // `aria-hidden` sits on each <svg> rather than in the shared props: the
  // button's own aria-label is the accessible name, and the lint rule that
  // enforces it can't see through a spread.
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-4",
  };
  if (theme === "light") {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
