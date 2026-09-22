import { createPathMask } from "@repo/analytics";

/**
 * How this app's routes (App.tsx) are reported to analytics.
 *
 * Three of them put something private in the path. `/invite/:token` is a
 * bearer capability — whoever holds it can accept the invitation.
 * `:candidateId` and `:username` together name a person and the matchmaker
 * keeping a record of them, which is the one pairing tenant isolation exists
 * to keep apart (prd/phase-1.md §9.1). Sending either to a third party would
 * undo in a pageview what the backend spends its access helpers enforcing.
 *
 * Both builders take the base path rather than reading `import.meta.env`, so
 * a test states which mount it is describing instead of inheriting whichever
 * one the runner happens to define.
 */

/** Routes with no dynamic segment, reported as themselves. */
const LITERAL_PATHS = [
  "/",
  "/sign-in",
  "/settings",
  "/c",
  "/c/mm/discover",
  "/mm/new",
] as const;

/** Routes reported as their pattern rather than as the path visited. */
const MASKED_PATTERNS = [
  "/invite/:token",
  "/invitations/:candidateId",
  "/c/:matchmakerUsername",
  "/mm/:username",
  "/mm/:username/matches",
  "/mm/:username/onboard",
  "/mm/:username/settings",
  "/mm/:username/c/:candidateId",
] as const;

/** The path masker for this app mounted under `basePath`. */
export function createAppPathMask(
  basePath: string,
): (pathname: string) => string {
  return createPathMask({
    basePath,
    literals: LITERAL_PATHS,
    patterns: MASKED_PATTERNS,
  });
}

/**
 * The matchmaker whose workspace `pathname` is inside, or `null`. Read from
 * the path rather than from `useParams`, so the caller can sit above the
 * routes and still see every move between workspaces.
 */
export function workspaceUsernameIn(
  basePath: string,
  pathname: string,
): string | null {
  const base = basePath.replace(/\/+$/, "");
  const withinBase = base !== "" && pathname.startsWith(`${base}/`);
  const path = withinBase ? pathname.slice(base.length) : pathname;
  const segments = path.split("/");
  // ["", "mm", "<username>", ...] — and "/mm/new" is the create page, not a
  // workspace, so there is no tenant yet to file events under.
  if (segments[1] !== "mm") return null;
  const username = segments[2];
  if (username === undefined || username === "" || username === "new") {
    return null;
  }
  return username;
}

/** The app is served under Vite's `base` (`/app/` today), so paths carry it. */
const BASE_PATH = import.meta.env.BASE_URL;

export const maskAppPath = createAppPathMask(BASE_PATH);

export function workspaceUsername(pathname: string): string | null {
  return workspaceUsernameIn(BASE_PATH, pathname);
}
