import { cn } from "@repo/ui";
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router";

/**
 * Whether the sidebar is collapsed, remembered per browser.
 *
 * apps/app shares this origin in production (see `main.tsx`), so the key is
 * the admin app's own. Blocked storage only costs the preference.
 */
const COLLAPSED_KEY = "matchbuild-admin-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const NAV = [
  { to: "/audit", label: "Audit trail", icon: AuditIcon },
  { to: "/sign-in-codes", label: "Sign-in codes", icon: KeyIcon },
  { to: "/erasure", label: "Erasure", icon: EraseIcon },
  { to: "/ai", label: "AI agents", icon: AgentIcon },
  { to: "/usage", label: "AI usage", icon: UsageIcon },
] as const;

/**
 * The admin app's navigation, down the left of every signed-in page, and the
 * control that collapses it to its icons.
 *
 * Collapsed, a link is its icon alone. Its `aria-label` carries the name
 * either way, so the link reads the same to a screen reader in both states,
 * and `title` gives a pointer the same name on hover.
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // Private windows and blocked storage: the choice won't persist.
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((open) => !open), []);

  return (
    <aside
      id="admin-sidebar"
      data-testid="admin-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <nav aria-label="Admin" className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground",
              )
            }
          >
            <item.icon />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="admin-sidebar"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          data-testid="admin-sidebar-toggle"
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronIcon pointingRight={collapsed} />
          {!collapsed && <span className="truncate">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

/*
 * Icons are inline: four of them and a chevron don't pay for a dependency.
 * Each is `aria-hidden` — the link beside it carries the name — and says so
 * on the element rather than through this spread, which the a11y lint rule
 * can't see into.
 */
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "size-5 shrink-0",
} as const;

/** Recorded lines: the audit trail. */
function AuditIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="M4 6h10M4 12h16M4 18h12" />
    </svg>
  );
}

/** A key: the sign-in codes an operator issues. */
function KeyIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H21M18 12v3M15 12v2" />
    </svg>
  );
}

/** A person struck through: erasure anonymises rather than deletes. */
function EraseIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

/** A spark: the agents that draft and extract. */
function AgentIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  );
}

/** Bars rising: what the agents are spending. */
function UsageIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="M4 20h16" />
      <path d="M7 20v-5M12 20V9M17 20v-8" />
    </svg>
  );
}

function ChevronIcon({ pointingRight }: { pointingRight: boolean }) {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d={pointingRight ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
    </svg>
  );
}
