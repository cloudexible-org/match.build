import type { Page } from "@playwright/test";
import { CreateMatchmakerPage } from "./page-objects/app/matchmaker.page";
import {
  CompleteProfilePage,
  SignInPage,
} from "./page-objects/app/sign-in.page";
import { latestSignInEmail, waitForSignInCode } from "./sign-in-codes";

/**
 * Account set-up shared by `app-convex` specs.
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

/** Signs up a brand-new account and names it; ends on the home page. */
export async function signUp(page: Page, label: string, name: string) {
  const email = uniqueEmail(label);
  const signIn = new SignInPage(page);
  await signIn.goto();
  const before = await latestSignInEmail(email);
  await signIn.requestCode(email);
  await signIn.enterCode(await waitForSignInCode(email, before));
  await new CompleteProfilePage(page).submitName(name);
  return { email };
}

/** Signs up and creates a matchmaker profile; ends in its workspace. */
export async function signUpAsMatchmaker(page: Page, label: string) {
  await signUp(page, label, "Maya Maker");
  const username = uniqueUsername();
  const create = new CreateMatchmakerPage(page);
  await create.goto();
  await create.create({ username, displayName: "Maya Matches" });
  await page.waitForURL(new RegExp(`/app/mm/${username}$`));
  return { username };
}
