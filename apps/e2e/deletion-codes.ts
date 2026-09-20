import { latestSignInEmail } from "./sign-in-codes";

/**
 * Account-deletion codes from the local backend's `emailOutbox`: with no
 * RESEND_API_KEY they are written there instead of sent, like sign-in codes
 * and invite links, and read back through the same internal query.
 *
 * Matched on the subject rather than just taking the latest email, because
 * `signInAs` has already put a sign-in code in the same outbox.
 */

const SUBJECT = /^(\d{6}) is your Matchmaker account deletion code$/;

/**
 * Waits for a deletion code emailed to `email` other than `previous` (a code
 * seen earlier, or `null` for the first), and returns it.
 */
export async function waitForDeletionCode(
  email: string,
  previous: string | null = null,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const latest = await latestSignInEmail(email);
    const code = latest?.subject.match(SUBJECT)?.[1];
    if (code !== undefined && code !== previous) return code;
    if (Date.now() > deadline) {
      throw new Error(
        `No new deletion code for ${email} within ${timeoutMs}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** A six-digit code that is definitely not `code`. */
export function wrongCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}
