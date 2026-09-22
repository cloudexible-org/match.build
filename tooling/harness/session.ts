import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { localBackendUrl } from "./local-backend";
import { latestSignInEmail, waitForSignInCode } from "./sign-in-codes";

/**
 * Signing in without driving the UI.
 *
 * Only `sign-in.spec.ts` and `sign-up.spec.ts` are about the sign-in screens;
 * every other spec just needs to *be* someone. Typing an email, waiting for a
 * code and typing it takes a second or two per test and can only add flake, so
 * those specs run the same Convex Auth flow over HTTP and hand the resulting
 * session to the browser.
 *
 * The session lives in `localStorage` under the keys `@convex-dev/auth`'s
 * React client reads (`__convexAuthJWT_<namespace>`, namespace = the
 * deployment URL with non-alphanumerics stripped). It is installed by an init
 * script, which runs **before the app's own code** in the caller's next
 * navigation, and applies **once**. All three of those are load-bearing:
 *
 * - *Before the app*, because a document that boots with a session already in
 *   storage starts Convex's auth client on it, and that client immediately
 *   refreshes the session it found — `initialAuthTokenReuse` defaults to
 *   false, so the token read from storage is confirmed and then rotated — and
 *   writes the new pair back. Writing from the test side into such a document
 *   is two writers racing over one pair of keys: signing in as a second person
 *   wins only if the first person's refresh has already landed. When it landed
 *   a moment later instead, the tokens reverted to the *previous* person and
 *   the next navigation quietly signed in as them. That is what made
 *   `mobile.spec.ts` fail on a loaded machine with "You're already a member of
 *   this matchmaker." on the accept screen. Installing before the document has
 *   run any app code removes the second writer rather than outrunning it: the
 *   document holding the old session is already gone.
 * - *Once*, because a script that re-ran on every navigation would silently
 *   sign the page back in after a sign-out, and no test could ever prove
 *   sign-out works. The marker below is what confines it to the first
 *   navigation after this call; a later `signInAs` installs its own script
 *   with its own marker, so switching people still works.
 * - *The caller's navigation*, because this helper must not make one of its
 *   own. Signing in is not a neutral act: land on the app as a candidate and
 *   the shell opens their first conversation, which marks it read — which is
 *   the very thing `notifications-panel.spec.ts` asserts has not happened
 *   yet. So `signInAs` only arms the session, and the spec's own `goto` —
 *   which it has to write anyway — is what applies it.
 */

type Tokens = { token: string; refreshToken: string };

const storageNamespace = (url: string) => url.replace(/[^a-zA-Z0-9]/g, "");

/** Runs the email-code flow over HTTP and returns the session's tokens. */
export async function fetchSession(email: string): Promise<Tokens> {
  const client = new ConvexHttpClient(localBackendUrl());
  const before = await latestSignInEmail(email);
  await client.action(
    "auth:signIn" as never,
    {
      provider: "email-code",
      params: { email },
    } as never,
  );
  const code = await waitForSignInCode(email, before);
  const result = (await client.action(
    "auth:signIn" as never,
    {
      provider: "email-code",
      params: { email, code },
    } as never,
  )) as { tokens?: Tokens | null };
  if (!result.tokens) {
    throw new Error(`Signing in as ${email} returned no session`);
  }
  return result.tokens;
}

/**
 * Signs `page` in as `email`, for every navigation it makes afterwards.
 * The account must exist (seed it with `seedScenario`); a brand-new address
 * signs up, exactly as it would in the UI.
 *
 * It does not navigate: the session lands on the caller's next `goto`, and a
 * page that never navigates afterwards stays whoever it already was.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const tokens = await fetchSession(email);
  // Unique per call, so this script can tell "I have already run" from
  // "an earlier signInAs ran".
  const marker = `__e2eSession_${randomUUID()}`;
  await page.addInitScript(
    ([namespace, jwt, refresh, once]) => {
      // Applied on an earlier navigation: leave storage alone, so a sign-out
      // in between stays signed out.
      if (window.localStorage.getItem(once) !== null) return;
      window.localStorage.setItem(once, "1");
      window.localStorage.setItem(`__convexAuthJWT_${namespace}`, jwt);
      window.localStorage.setItem(
        `__convexAuthRefreshToken_${namespace}`,
        refresh,
      );
    },
    [
      storageNamespace(localBackendUrl()),
      tokens.token,
      tokens.refreshToken,
      marker,
    ] as const,
  );
}
