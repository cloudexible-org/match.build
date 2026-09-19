/**
 * Invitation rules (prd/phase-1.md §3.2). Plain code with no Convex imports,
 * exported through `@repo/api`.
 */

/** An invite link works for 30 days, then a scheduled job clears it. */
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The app path an invite token opens, relative to the app's base URL. */
export function invitePath(token: string): string {
  return `invite/${token}`;
}
