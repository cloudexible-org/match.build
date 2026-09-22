/**
 * Validation for matchmaker profiles (prd/phase-1.md §1.1, §1.2), shared by
 * the matchmakers mutations and the app's forms. Plain code with no Convex
 * imports, exported through `@repo/api`.
 */

import { normaliseName } from "../users/rules";

export const MATCHMAKER_LIMITS = {
  usernameMin: 6,
  usernameMax: 30,
  displayName: 60,
} as const;

/**
 * Compared against the canonical key (dots removed), so every entry is
 * written without dots. Names under six characters are already invalid by
 * length and aren't listed. Extend the list rather than blocking substrings:
 * a substring rule would reject names like `janethematchmaker`.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // Email & infrastructure
  "postmaster",
  "hostmaster",
  "webmaster",
  "mailerdaemon",
  "noreply",
  "donotreply",
  "mailer",
  "bounce",
  "bounces",
  "invite",
  "invites",
  "invitation",
  "invitations",
  "notify",
  "notification",
  "notifications",
  "unsubscribe",
  "newsletter",
  "security",
  // Support & business
  "support",
  "helpdesk",
  "contact",
  "feedback",
  "privacy",
  "compliance",
  "billing",
  "payments",
  "invoices",
  "account",
  "accounts",
  "marketing",
  "report",
  "reports",
  "safety",
  "trustandsafety",
  // Authority & impersonation
  "matchmaker",
  "matchmakers",
  "matchmakerio",
  "matchmakerapp",
  "matchmakeros",
  "official",
  "verified",
  "admins",
  "administrator",
  "moderator",
  "moderators",
  "system",
  "sysadmin",
  "superuser",
  // Product words
  "candidate",
  "candidates",
  "client",
  "clients",
  "matches",
  "discover",
  "explore",
  "search",
  "messages",
  "dashboard",
  "onboarding",
  "workspace",
  "profile",
  "profiles",
  "settings",
  "username",
  // Auth & app plumbing
  "signin",
  "signup",
  "signout",
  "logout",
  "register",
  "status",
  "health",
  "static",
  "assets",
  "public",
  // Placeholders
  "anonymous",
  "undefined",
  "nobody",
  "everyone",
]);

/** The chosen form: trimmed and lowercased. Stored as `username`. */
export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The canonical form that carries uniqueness, as in Gmail: dots removed, so
 * `jane.smith` and `janesmith` are the same username. Stored as
 * `usernameKey`. Accepts raw input, so a URL in any case or dot placement
 * finds its profile.
 */
export function usernameKey(raw: string): string {
  return normaliseUsername(raw).replaceAll(".", "");
}

/**
 * Returns an error message, or `null` when the (raw) username is acceptable.
 * Doesn't check whether it's taken: only the server can.
 */
export function usernameError(raw: string): string | null {
  const username = normaliseUsername(raw);
  if (!username) return "Choose a username.";
  if (!/^[a-z0-9.]+$/.test(username)) {
    return "Use only letters, numbers and periods.";
  }
  if (username.length < MATCHMAKER_LIMITS.usernameMin) {
    return `Use at least ${MATCHMAKER_LIMITS.usernameMin} characters.`;
  }
  if (username.length > MATCHMAKER_LIMITS.usernameMax) {
    return `Use at most ${MATCHMAKER_LIMITS.usernameMax} characters.`;
  }
  if (username.startsWith(".") || username.endsWith(".")) {
    return "A username can't start or end with a period.";
  }
  if (username.includes("..")) {
    return "A username can't have two periods in a row.";
  }
  if (!/[a-z]/.test(username)) return "Include at least one letter.";
  if (RESERVED_USERNAMES.has(usernameKey(username))) {
    return "That username isn't available.";
  }
  return null;
}

/** Returns an error message, or `null` when the (raw) display name is fine. */
export function displayNameError(raw: string): string | null {
  const name = normaliseName(raw);
  if (!name) return "Enter a display name.";
  if (name.length > MATCHMAKER_LIMITS.displayName) {
    return "That display name is too long.";
  }
  return null;
}
