import type { Page } from "@playwright/test";
import { AdminSignInPage } from "./page-objects/admin/sign-in.page";
import {
  CompleteProfilePage,
  SignInPage,
} from "./page-objects/app/sign-in.page";
import { latestSignInEmail, waitForSignInCode } from "./sign-in-codes";

/**
 * Signing *up* through the UI, for the specs that are about that flow.
 * Everywhere else, seed the account (`scenario.ts`) and sign in over HTTP
 * (`session.ts`): it is an order of magnitude faster.
 *
 * Every call uses an address unique to this run and label, so specs never
 * share an account or a pending sign-in code (see the note in
 * `packages/api/convex/seed/e2e/fixture.ts`).
 */

export function uniqueEmail(label: string): string {
  return `new.${label}.${process.pid}.${Date.now()}@matchmaker-e2e.test`;
}

/** A valid matchmaker username unique to this run: letters, digits, one dot. */
export function uniqueUsername(): string {
  return `e2e.${Date.now().toString(36)}${process.pid}`;
}

/**
 * Signs up a brand-new account and names it; ends on the home page, or on
 * the page that sent the visitor to sign in.
 *
 * `email` defaults to a fresh address; pass one to sign up as an invited
 * person. `goto: false` starts from wherever the page already is (the
 * sign-in page a protected link redirected to).
 */
export async function signUp(
  page: Page,
  label: string,
  name: string,
  options: { email?: string; goto?: boolean } = {},
) {
  const email = options.email ?? uniqueEmail(label);
  const signIn = new SignInPage(page);
  if (options.goto !== false) await signIn.goto();
  const before = await latestSignInEmail(email);
  await signIn.requestCode(email);
  await signIn.enterCode(await waitForSignInCode(email, before));
  await new CompleteProfilePage(page).submitName(name);
  return { email };
}

/**
 * Signs in to apps/admin with an emailed code. Admin or not: the page the
 * account lands on is the caller's to assert.
 */
export async function signInToAdmin(page: Page, email: string) {
  const signIn = new AdminSignInPage(page);
  await signIn.goto();
  const before = await latestSignInEmail(email);
  await signIn.requestCode(email);
  await signIn.enterCode(await waitForSignInCode(email, before));
}
