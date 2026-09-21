import { api, type Id } from "@repo/api";
import { buttonVariants, cn } from "@repo/ui";
import { useQuery } from "convex/react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router";
import { AppHeader } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";
import { NotFoundPage } from "../pages/not-found";

export type Workspace = {
  matchmakerId: Id<"matchmakers">;
  username: string;
  displayName: string;
  businessName?: string;
};

/** The workspace the current `/mm/:username/…` route selected. */
export function useWorkspace(): Workspace {
  return useOutletContext<Workspace>();
}

/**
 * Resolves `/mm/:username` to the signed-in account's own matchmaker profile
 * and renders the page under it.
 *
 * - Another dot placement or case (`/mm/JaneSmith`) redirects to the chosen
 *   form (`/mm/jane.smith`), keeping the rest of the path.
 * - Someone else's profile and a username nobody has both show "Page not
 *   found": the server answers them identically.
 *
 * The route only selects a workspace; every call re-checks access on the
 * server (prd/phase-1.md §4, §9.2).
 */
export function WorkspaceLayout() {
  const { username = "" } = useParams();
  const location = useLocation();
  const me = useQuery(api.users.queries.me);
  const workspace = useQuery(api.matchmakers.queries.workspace, { username });
  // Home now resolves straight to this workspace, so it is no longer the
  // bridge to the owner's own candidate side; this nav is.
  const home = useQuery(api.users.queries.home);

  if (me === undefined || workspace === undefined) {
    return <FullPageStatus>Loading…</FullPageStatus>;
  }
  if (me === null) return null; // RequireAuth handles this
  if (workspace === null) return <NotFoundPage />;

  if (workspace.username !== username) {
    const prefix = `/mm/${encodeURIComponent(username)}`;
    const rest = location.pathname.startsWith(prefix)
      ? location.pathname.slice(prefix.length)
      : "";
    return (
      <Navigate
        to={`/mm/${workspace.username}${rest}${location.search}`}
        replace
      />
    );
  }

  const base = `/mm/${workspace.username}`;
  // `h-dvh`, not `min-h-dvh`: the workspace is a chat shell, and its columns
  // scroll inside themselves. A frame that can grow is a frame that takes the
  // composer off the bottom of the screen.
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        name={me.name ?? ""}
        nav={
          <nav className="flex min-w-0 items-center gap-1 text-sm">
            {/* Separates the workspace from the brand, so it goes with it. */}
            <span
              aria-hidden
              className="hidden text-muted-foreground sm:inline"
            >
              /
            </span>
            <Link
              to={base}
              className="truncate rounded-md px-2 py-1 font-medium hover:bg-accent"
              data-testid="workspace-name"
            >
              {workspace.displayName}
            </Link>
            <Link
              to={`${base}/matches`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              data-testid="workspace-matches"
            >
              Matches
            </Link>
            <Link
              to={`${base}/settings`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Settings
            </Link>
            {home !== undefined &&
              home !== null &&
              home.candidateProfiles.length > 0 && (
                <Link
                  to="/c"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "hidden sm:inline-flex",
                  )}
                  data-testid="workspace-my-matchmakers"
                >
                  Your matchmakers
                </Link>
              )}
          </nav>
        }
      />
      {/* Two page shapes live under this header. The chat shell fills this
          box exactly and scrolls inside its own columns, so this never
          scrolls; the workspace's settings and onboard are ordinary pages
          taller than the screen, and this is what scrolls them. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet context={workspace satisfies Workspace} />
      </div>
    </div>
  );
}
