import { useAnalyticsIdentity } from "@repo/analytics";
import { api } from "@repo/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useLocation } from "react-router";
import { workspaceUsername } from "./routes";

/**
 * Tells analytics who is using the app, and which matchmaker's workspace they
 * are in.
 *
 * Mounted beside the routes rather than inside `RequireAuth`, which unmounts
 * the moment a session ends — and the sign-out is exactly the transition that
 * has to reach `reset()`.
 */
export function AnalyticsIdentity() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.queries.me, isAuthenticated ? {} : "skip");
  const { pathname } = useLocation();

  // `undefined` means "not known yet" and changes nothing; `null` means
  // signed out, which is what clears the previous person.
  let userId: string | null | undefined;
  if (isLoading) userId = undefined;
  else if (!isAuthenticated) userId = null;
  else if (me === undefined) userId = undefined;
  else userId = me?._id ?? null;

  useAnalyticsIdentity({
    userId,
    groupType: "matchmaker",
    groupKey: workspaceUsername(pathname),
  });

  return null;
}
