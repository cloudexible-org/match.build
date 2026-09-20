/**
 * The one fact that has to survive a sign-out: this account was just deleted,
 * so the sign-in page can say so instead of looking like an ordinary sign-out
 * (prd/phase-1.md §3.5).
 *
 * It can't be passed in the URL. The moment the deletion lands, the `me` query
 * answers `null` and RequireAuth signs the stale session out and redirects, and
 * that redirect races the one the settings page makes. `sessionStorage` is read
 * by whichever arrival wins, and only in this tab.
 *
 * Every access is guarded: storage throws in a private window or with site
 * data blocked, and a missing notice must never break signing in.
 */

const KEY = "matchmaker.accountDeleted";

export function markAccountDeleted(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // No storage: the person just sees the plain sign-in page.
  }
}

/** Whether an account was just deleted. Reading it clears it. */
export function takeAccountDeleted(): boolean {
  try {
    const found = window.sessionStorage.getItem(KEY) !== null;
    if (found) window.sessionStorage.removeItem(KEY);
    return found;
  } catch {
    return false;
  }
}
