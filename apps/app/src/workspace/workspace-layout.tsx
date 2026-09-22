import { api, type Id } from "@repo/api";
import { useQuery } from "convex/react";
import {
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router";
import { AppHeader, type HeaderLink } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";
import { NotFoundPage } from "../pages/not-found";

export type Workspace = {
  matchmakerId: Id<"matchmakers">;
  username: string;
  displayName: string;
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
  // **Profile settings**, not "Settings": the header has two of them, and the
  // other one is the account's. This is the matchmaker profile the workspace
  // is (prd/phase-1.md §4).
  const links: HeaderLink[] = [
    { to: `${base}/matches`, label: "Matches", testId: "workspace-matches" },
    { to: `${base}/settings`, label: "Profile settings" },
  ];
  // Only for an owner who is also somebody's candidate, which most are not.
  if (
    home !== undefined &&
    home !== null &&
    home.candidateProfiles.length > 0
  ) {
    links.push({
      to: "/c",
      label: "Your matchmakers",
      testId: "workspace-my-matchmakers",
    });
  }

  // `h-dvh`, not `min-h-dvh`: the workspace is a chat shell, and its columns
  // scroll inside themselves. A frame that can grow is a frame that takes the
  // composer off the bottom of the screen.
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        name={me.name ?? ""}
        workspace={{ to: base, label: workspace.displayName }}
        links={links}
      />
      {/* Two page shapes live under this header. The chat shell fills this
          box exactly and scrolls inside its own columns, so this never
          scrolls; the workspace's settings and onboard are ordinary pages
          taller than the screen, and this is what scrolls them. */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-testid="workspace-frame"
      >
        <Outlet context={workspace satisfies Workspace} />
      </div>
    </div>
  );
}
