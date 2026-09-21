import { latestSignInEmail } from "./sign-in-codes";

/**
 * Invite links from the local backend's `emailOutbox`: with no
 * RESEND_API_KEY, invitation emails are written there instead of sent, like
 * sign-in codes. Read through the same internal query, which returns the
 * latest email of any kind to an address.
 */

const LINK = /https?:\/\/\S+\/app\/invite\/[A-Za-z0-9_-]{43}/;

/**
 * Waits for an invitation email to `email` whose link differs from
 * `previous` (a link seen earlier, or `null` for the first), and returns
 * the link.
 */
export async function waitForInviteLink(
  email: string,
  previous: string | null = null,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const latest = await latestSignInEmail(email);
    const link = latest?.text.match(LINK)?.[0];
    if (link !== undefined && link !== previous) return link;
    if (Date.now() > deadline) {
      throw new Error(`No new invite link for ${email} within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** The path part of an invite link, for `page.goto` on the test's origin. */
export function invitePath(link: string): string {
  return new URL(link).pathname;
}
