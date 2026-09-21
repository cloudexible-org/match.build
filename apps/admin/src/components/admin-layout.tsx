import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@repo/api";
import { Button, cn } from "@repo/ui";
import { useQuery } from "convex/react";
import { NavLink, Outlet } from "react-router";

const NAV = [
  { to: "/audit", label: "Audit trail" },
  { to: "/sign-in-codes", label: "Sign-in codes" },
  { to: "/erasure", label: "Erasure" },
] as const;

/** Top bar and page frame for every signed-in admin page. */
export function AdminLayout() {
  const { signOut } = useAuthActions();
  const me = useQuery(api.admin.queries.me);
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
            <span className="shrink-0 font-display text-xl">
              match.build <span className="text-muted-foreground">Admin</span>
            </span>
            <nav className="flex gap-1" aria-label="Admin">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                      isActive
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
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
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
