import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@repo/ui";
import { Link } from "react-router";

/** Top bar for signed-in pages: brand, who's signed in, and sign out. */
export function AppHeader({ name }: { name: string }) {
  const { signOut } = useAuthActions();
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
        <Link to="/" className="font-display text-xl">
          Matchmaker
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="truncate text-sm text-muted-foreground"
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
