import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@repo/api";
import { Button } from "@repo/ui";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { FullPageStatus } from "../components/full-page-status";
import { signInPath } from "./redirects";

/**
 * Gate for every admin page.
 *
 * - Signed out → sign-in, remembering where the admin was headed.
 * - Signed in to an account that no longer exists → signs it out.
 * - Signed in as someone not in PLATFORM_ADMIN_EMAILS → says so. The server
 *   refuses them regardless; this only saves them a page of errors.
 */
export function RequireAdmin() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.admin.queries.me, isAuthenticated ? {} : "skip");
  const location = useLocation();

  if (isLoading) return <FullPageStatus>Loading…</FullPageStatus>;
  if (!isAuthenticated) {
    return (
      <Navigate to={signInPath(location.pathname + location.search)} replace />
    );
  }
  if (me === undefined) return <FullPageStatus>Loading…</FullPageStatus>;
  if (me === null) return <StaleSession />;
  if (!me.isAdmin) return <NotAnAdmin email={me.email} />;
  return <Outlet />;
}

function StaleSession() {
  const { signOut } = useAuthActions();
  useEffect(() => {
    void signOut();
  }, [signOut]);
  return <FullPageStatus>Signing out…</FullPageStatus>;
}

function NotAnAdmin({ email }: { email?: string }) {
  const { signOut } = useAuthActions();
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center"
      data-testid="not-an-admin"
    >
      <h1 className="font-display text-3xl">Not a platform admin</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {email ?? "This account"} can't use the admin app. Sign in with a
        platform admin's email instead.
      </p>
      <Button variant="outline" onClick={() => void signOut()}>
        Sign out
      </Button>
    </main>
  );
}
