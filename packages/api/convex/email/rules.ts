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
 * Must be on a domain verified in Resend. `aileenlancif.com` is the interim
 * production domain (prd/phase-1.md §10) until a product domain is bought.
 */
export const SIGN_IN_FROM = "Matchmaker <no-reply@aileenlancif.com>";

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
    subject: `${code} is your Matchmaker sign-in code`,
    text: [
      `Your Matchmaker sign-in code is ${code}.`,
      "",
      `It expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
    ].join("\n"),
    html: [
      `<p>Your Matchmaker sign-in code is</p>`,
      `<p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p>`,
      `<p>It expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.</p>`,
    ].join(""),
  };
}
