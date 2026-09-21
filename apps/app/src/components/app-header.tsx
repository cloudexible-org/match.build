import { useAuthActions } from "@convex-dev/auth/react";
import { Button, cn } from "@repo/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ThemeToggle } from "./theme-toggle";

/**
 * Top bar for signed-in pages: brand, who's signed in, and sign out.
 *
 * The account's name is the way into `/settings` (account name, deleting the
 * account). `nav` adds links after the brand (a workspace's name and its own
 * settings); the account name then gives way to them on narrow screens —
 * a workspace's owner can't delete their account anyway (prd §3.5), and
 * reaches account settings from home. `wide` spans the full width for the
 * workspace's columns instead of the reading width.
 */
export function AppHeader({
  name,
  nav,
  wide = false,
}: {
  name: string;
  nav?: ReactNode;
  wide?: boolean;
}) {
  const { signOut } = useAuthActions();
  return (
    <header className="border-b border-border bg-card">
      <div
        className={cn(
          "mx-auto flex h-14 items-center justify-between gap-4 px-4",
          !wide && "max-w-3xl",
        )}
      >
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
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
