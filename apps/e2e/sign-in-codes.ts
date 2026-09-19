import { adminClient } from "./admin-client";

type OutboxEmail = { subject: string; text: string } | null;

/**
 * The latest sign-in email the local backend "sent" to `email`. With no
 * RESEND_API_KEY configured (see `auth-env.ts`) codes are written to the
 * internal `emailOutbox` table instead of being mailed.
 */
export async function latestSignInEmail(email: string): Promise<OutboxEmail> {
  return (await adminClient().query(
    // By string: apps/e2e does not depend on the backend's generated API.
    "email/queries:latestOutboxEmail" as never,
    { to: email } as never,
  )) as OutboxEmail;
}

/**
 * Waits for a sign-in code newer than `previous` (the email returned by
 * `latestSignInEmail` before the code was requested) and returns it.
 *
 * Comparing against the previous email rather than just taking the latest is
 * what makes "send a new code" testable: the old code is still in the outbox
 * until the new one lands.
 */
export async function waitForSignInCode(
  email: string,
  previous: OutboxEmail,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const latest = await latestSignInEmail(email);
    if (latest !== null && latest.subject !== previous?.subject) {
      const code = latest.subject.match(/\b(\d{6})\b/)?.[1];
      if (!code) throw new Error(`No code in "${latest.subject}"`);
      return code;
    }
    if (Date.now() > deadline) {
      throw new Error(`No new sign-in code for ${email} within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
