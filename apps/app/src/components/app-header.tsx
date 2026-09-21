import { useAuthActions } from "@convex-dev/auth/react";
import { Button, cn } from "@repo/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { HeaderNotifications } from "../notifications/header-notifications";
import { ThemeToggle } from "./theme-toggle";

/**
 * Top bar for signed-in pages: brand, who's signed in, and sign out.
 *
 * The account's name is the way into `/settings` (account name, deleting the
 * account). `nav` adds links after the brand (a workspace's name and its own
 * settings); the account name then gives way to them on narrow screens —
 * a workspace's owner can't delete their account anyway (prd §3.5), and
 * reaches account settings from home.
 *
 * Full width on every page, whatever the page under it is: the header is
 * the app's frame rather than part of the page, and a frame that changes
 * width as you navigate reads as the page jumping.
 */
export function AppHeader({ name, nav }: { name: string; nav?: ReactNode }) {
  const { signOut } = useAuthActions();
  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between gap-4 px-4">
        {/* The brand and workspace name give way; the controls on the right
            can't shrink, and at 380px something has to. */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link to="/" className="truncate font-display text-xl">
            match.build
          </Link>
          {nav}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            to="/settings"
            aria-label={`Account settings for ${name}`}
            className={cn(
              "truncate rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              nav !== undefined && "hidden sm:inline",
            )}
            data-testid="header-account-name"
          >
            {name}
          </Link>
          <HeaderNotifications />
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
