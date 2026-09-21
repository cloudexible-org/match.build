import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@repo/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { FullPageStatus } from "../components/full-page-status";
import { CompleteProfilePage } from "../pages/complete-profile";
import { signInPath } from "./redirects";

/**
 * Gate for every signed-in route.
 *
 * - Signed out → the sign-in page, remembering where the person was headed.
 * - Signed in without a name yet (a brand-new account) → asks for it first.
 * - Signed in to an account that no longer exists (deleted elsewhere) →
 *   signs the stale session out.
 */
export function RequireAuth() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.queries.me, isAuthenticated ? {} : "skip");
  const location = useLocation();

  if (isLoading) return <FullPageStatus>Loading…</FullPageStatus>;
  if (!isAuthenticated) {
    return (
      <Navigate
        to={signInPath(location.pathname + location.search + location.hash)}
        replace
      />
    );
  }
  if (me === undefined) return <FullPageStatus>Loading…</FullPageStatus>;
  if (me === null) return <StaleSession />;
  if (!me.name) return <CompleteProfilePage />;
  return <Outlet />;
}

function StaleSession() {
  const { signOut } = useAuthActions();
  useEffect(() => {
    void signOut();
  }, [signOut]);
  return <FullPageStatus>Signing out…</FullPageStatus>;
}
