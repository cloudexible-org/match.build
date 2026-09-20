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

/**
 * How many wrong guesses an account-deletion code survives (prd/phase-1.md
 * §3.5) before it is thrown away and a new one has to be requested. Deleting
 * an account is irreversible, so the code is not something to brute-force.
 */
export const ACCOUNT_DELETION_MAX_ATTEMPTS = 5;

/** Returns an error message, or `null` when the code is the right shape. */
export function deletionCodeError(raw: string, length: number): string | null {
  const code = raw.trim();
  if (!code) return "Enter the code we emailed you.";
  return new RegExp(`^\\d{${length}}$`).test(code)
    ? null
    : `The code is ${length} digits.`;
}
