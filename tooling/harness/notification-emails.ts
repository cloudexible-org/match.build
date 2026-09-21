import { latestSignInEmail } from "./sign-in-codes";

/**
 * New-message notification emails from the local backend's `emailOutbox`.
 *
 * Matched on the kind rather than taking the latest email, because the same
 * outbox already holds the sign-in code `signInAs` caused.
 */
export async function waitForNotificationEmail(
  email: string,
  timeoutMs = 15_000,
): Promise<{ subject: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const latest = await latestSignInEmail(email);
    if (latest?.subject.startsWith("You have a new message")) {
      return latest;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `No notification email for ${email} within ${timeoutMs}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
