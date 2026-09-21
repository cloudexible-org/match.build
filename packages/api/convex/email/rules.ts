/**
 * Email content and sign-in code rules (prd/phase-1.md §8). Plain code with no
 * Convex imports.
 */

/**
 * Convex Auth's id for the email-code provider (auth.ts). The client passes it
 * to `signIn`, and codes and accounts are stored under it.
 */
export const SIGN_IN_PROVIDER_ID = "email-code";

export const SIGN_IN_CODE_LENGTH = 6;

/** How long a sign-in code stays valid. */
export const SIGN_IN_CODE_TTL_SECONDS = 10 * 60;

/**
 * Must be on a domain verified in Resend. `match.build` is the production
 * domain (prd/phase-1.md §10).
 */
export const SIGN_IN_FROM = "match.build <no-reply@match.build>";

/**
 * Deleting an account is confirmed with a one-time code too (prd/phase-1.md
 * §3.5) — the same six digits, generator and lifetime as a sign-in code, under
 * names that read right where they're used. It is not a credential: only
 * `users.deleteAccount` accepts it, and only from the account that asked.
 */
export const ACCOUNT_DELETION_CODE_LENGTH = SIGN_IN_CODE_LENGTH;
export const ACCOUNT_DELETION_CODE_TTL_SECONDS = SIGN_IN_CODE_TTL_SECONDS;

const CODE_SPACE = 10 ** SIGN_IN_CODE_LENGTH;
// The largest multiple of CODE_SPACE that fits in a uint32. Values at or above
// it are rejected so every code is equally likely (no modulo bias).
const UNBIASED_LIMIT = Math.floor(2 ** 32 / CODE_SPACE) * CODE_SPACE;

/**
 * A uniformly random numeric code, zero-padded ("004213"). `randomUint32` is
 * injectable for tests; it defaults to the Web Crypto CSPRNG.
 */
export function generateSignInCode(
  randomUint32: () => number = cryptoUint32,
): string {
  for (;;) {
    const value = randomUint32();
    if (value < UNBIASED_LIMIT) {
      return String(value % CODE_SPACE).padStart(SIGN_IN_CODE_LENGTH, "0");
    }
  }
}

function cryptoUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export type EmailMessage = { subject: string; text: string; html: string };

export function signInCodeEmail(code: string): EmailMessage {
  const minutes = SIGN_IN_CODE_TTL_SECONDS / 60;
  return {
    subject: `${code} is your match.build sign-in code`,
    text: [
      `Your match.build sign-in code is ${code}.`,
      "",
      `It expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
    ].join("\n"),
    html: [
      `<p>Your match.build sign-in code is</p>`,
      `<p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p>`,
      `<p>It expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.</p>`,
    ].join(""),
  };
}

export function accountDeletionCodeEmail(code: string): EmailMessage {
  const minutes = ACCOUNT_DELETION_CODE_TTL_SECONDS / 60;
  return {
    subject: `${code} is your match.build account deletion code`,
    text: [
      `Someone asked to delete your match.build account. To confirm, enter ${code}.`,
      "",
      "Matchmakers you have worked with keep their copy of your past conversations.",
      "",
      `The code expires in ${minutes} minutes. If this wasn't you, ignore this email — nothing has been deleted, and your account is safe.`,
    ].join("\n"),
    html: [
      `<p>Someone asked to delete your match.build account. To confirm, enter</p>`,
      `<p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p>`,
      `<p>Matchmakers you have worked with keep their copy of your past conversations.</p>`,
      `<p>The code expires in ${minutes} minutes. If this wasn't you, ignore this email — nothing has been deleted, and your account is safe.</p>`,
    ].join(""),
  };
}
