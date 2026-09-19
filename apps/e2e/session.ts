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
 * deployment URL with non-alphanumerics stripped). It is written **once**,
 * from the sign-in page (which needs no session), rather than through
 * `addInitScript`: an init script re-runs on every navigation, so signing out
 * and reloading would silently sign the page back in and no test could ever
 * prove sign-out works.
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
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const tokens = await fetchSession(email);
  // Any page on the app's origin will do; sign-in is the one that renders
  // without a session.
  await page.goto("/app/sign-in");
  await page.evaluate(
    ([namespace, jwt, refresh]) => {
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
    ] as const,
  );
}
