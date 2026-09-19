import { useAuthActions } from "@convex-dev/auth/react";
import { Button, cn } from "@repo/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";

/**
 * Top bar for signed-in pages: brand, who's signed in, and sign out.
 *
 * `nav` adds links after the brand (a workspace's name and settings); the
 * account name then gives way to them on narrow screens. `wide` spans the
 * full width for the workspace's columns instead of the reading width.
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
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="shrink-0 font-display text-xl">
            Matchmaker
          </Link>
          {nav}
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "truncate text-sm text-muted-foreground",
              nav !== undefined && "hidden sm:inline",
            )}
            data-testid="header-account-name"
          >
            {name}
          </span>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
