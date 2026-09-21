import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@repo/api";
import { Button } from "@repo/ui";
import { useQuery } from "convex/react";
import { Outlet } from "react-router";
import { Sidebar } from "./sidebar";

/**
 * Frame for every signed-in admin page: the brand and account across the
 * top, the navigation down the left, the page filling what's left.
 *
 * Full width throughout: this is an operator's tool that reads audit trails
 * and tables, and a reading column would only make them scroll.
 */
export function AdminLayout() {
  const { signOut } = useAuthActions();
  const me = useQuery(api.admin.queries.me);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex h-14 items-center justify-between gap-4 px-4">
          <span className="min-w-0 shrink truncate font-display text-xl">
            match.build <span className="text-muted-foreground">Admin</span>
          </span>
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="hidden truncate text-sm text-muted-foreground sm:inline"
              data-testid="admin-account-email"
            >
              {me?.email}
            </span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      {/* `min-h-0` and `min-w-0`: the page's own tables must scroll inside
          this row rather than stretching it past the viewport. */}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
