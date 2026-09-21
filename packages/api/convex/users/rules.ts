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

/*
 * ─── Erasure (prd/phase-1.md §12) ───────────────────────────────────────────
 *
 * A right-to-erasure request and "nothing is deleted" (§6) pull in opposite
 * directions, and both are real: the person is entitled to disappear, and the
 * matchmaker's record of a relationship they ran is their own business record.
 *
 * The way out is to erase the *person*, not the record. Their name, address
 * and handles become stand-ins; the conversation, the notes and the audit
 * trail stay exactly where they are, attached to a candidate nobody can be
 * identified from.
 */

/** What an erased person is called. Deliberately not a plausible name. */
export const ERASED_ACCOUNT_NAME = "Erased account";
export const ERASED_CANDIDATE_NAME = "Erased candidate";

/**
 * A stand-in address, on the reserved `.invalid` TLD (RFC 2606) so it can
 * never resolve or be delivered to.
 *
 * Unique per record rather than a single constant: one matchmaker may have
 * erased two candidates, and a shared address would make them collide on the
 * one-candidate-per-(matchmaker, email) rule, so onboarding a third person
 * would find one of them.
 */
export function erasedEmail(unique: string): string {
  return `erased-${unique}@erased.invalid`;
}

/** Whether an address is one of ours, i.e. this record is already erased. */
export function isErasedEmail(email: string | undefined): boolean {
  return email?.endsWith("@erased.invalid") ?? false;
}
