import { invitePath } from "@repo/api";

/**
 * How the workspace names candidates and marks their membership
 * (prd/phase-1.md §4.1).
 */

export type Membership =
  | "invited"
  | "declined"
  | "joined"
  | "left"
  | "account_deleted";

/** The name to show: the matchmaker's label or account name, else email. */
export function candidateDisplayName(candidate: {
  name?: string;
  email: string;
}): string {
  return candidate.name ?? candidate.email;
}

/** The list marker for a candidate who isn't (or isn't yet) a member. */
export function membershipMarker(membership: Membership): string | null {
  switch (membership) {
    case "invited":
      return "Invited";
    case "declined":
      return "Declined";
    case "left":
      return "Left";
    case "account_deleted":
      return "Account deleted";
    case "joined":
      return null;
  }
}

/** The full invite URL for a token, on the app's own origin and base path. */
export function inviteUrl(token: string, origin: string, base: string): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${origin}${root}${invitePath(token)}`;
}
