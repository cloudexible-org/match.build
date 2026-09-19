/**
 * Validation for account fields, shared by the users mutations and the app's
 * forms. Plain code with no Convex imports, exported through `@repo/api`.
 */

export const USER_LIMITS = {
  name: 60,
} as const;

/** Trims and collapses internal whitespace: "  Jane   Doe " → "Jane Doe". */
export function normaliseName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Returns an error message, or `null` when the (raw) name is acceptable. */
export function accountNameError(raw: string): string | null {
  const name = normaliseName(raw);
  if (!name) return "Enter your name.";
  if (name.length > USER_LIMITS.name) return "That name is too long.";
  return null;
}
