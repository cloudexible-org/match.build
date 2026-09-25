import { expect, test } from "@playwright/test";
import { AccountSettingsPage } from "@repo/harness/page-objects/app/account-settings.page";
import { CandidateShellPage } from "@repo/harness/page-objects/app/candidate.page";
import { HomePage } from "@repo/harness/page-objects/app/home.page";
import {
  CompleteProfilePage,
  SignInPage,
} from "@repo/harness/page-objects/app/sign-in.page";
import {
  latestSignInEmail,
  waitForSignInCode,
} from "@repo/harness/sign-in-codes";

/**
 * A brand-new account against the seeded local backend: email → code → name
 * → home, asking whether they are a matchmaker or looking for a match.
 *
 * Parallel-safe: every spec signs up with an address unique to this run and
 * test, so no two specs share an account or a pending code.
 */

function freshEmail(label: string): string {
  return `new.${label}.${process.pid}.${Date.now()}@matchmaker-e2e.test`;
}

test("a new account signs up with an emailed code and names itself", async ({
  page,
}) => {
  const email = freshEmail("signup");
  const signIn = new SignInPage(page);
  await signIn.goto();

  const before = await latestSignInEmail(email);
  // Mixed case and padding: the address is normalised before it is sent.
  await signIn.requestCode(`  ${email.toUpperCase()} `);
  await expect(signIn.getCodeForm()).toBeVisible();
  await expect(signIn.getCodeSentTo(email)).toBeVisible();

  await signIn.enterCode(await waitForSignInCode(email, before));

  const profile = new CompleteProfilePage(page);
  await expect(profile.getForm()).toBeVisible();
  await profile.submitName("  Nova   Tester ");

  // Home asks which side they are on before anything else.
  const home = new HomePage(page);
  await expect(home.getChooseSide()).toBeVisible();
  await expect(home.getChooseMatchmakerLink()).toBeVisible();

  // Looking for a match: their own shell, with nothing in it and both ways
  // out.
  await home.getChooseCandidateLink().click();
  const shell = new CandidateShellPage(page);
  await expect(page).toHaveURL(/\/app\/c$/);
  await expect(shell.getMatchmakerList()).toContainText(
    "You haven't joined a matchmaker yet.",
  );
  await expect(shell.getInvitationsSection()).toBeHidden();
  await expect(shell.getNoConversations()).toBeVisible();
  await expect(shell.getCreateMatchmakerLink()).toBeVisible();

  // The session survives a reload: this re-reads from the backend rather than
  // trusting local state.
  await page.reload();
  await expect(shell.getMatchmakerList()).toBeVisible();

  // What they typed was normalised on the way in. The header no longer wears
  // the name, so this reads it where the name is now edited.
  const settings = new AccountSettingsPage(page);
  await settings.goto();
  await expect(settings.getNameInput()).toHaveValue("Nova Tester");
});

test("a wrong code is refused, and a new one can be requested", async ({
  page,
}) => {
  const email = freshEmail("wrongcode");
  const signIn = new SignInPage(page);
  await signIn.goto();

  const first = await latestSignInEmail(email);
  await signIn.requestCode(email);
  const code = await waitForSignInCode(email, first);
  const wrong = code === "000000" ? "111111" : "000000";

  await signIn.enterCode(wrong);
  await expect(
    signIn.getError("That code didn't work. Check it, or send a new one."),
  ).toBeVisible();

  const beforeResend = await latestSignInEmail(email);
  await signIn.getSendNewCodeButton().click();
  await expect(signIn.getError("We sent a new code.")).toBeVisible();
  const fresh = await waitForSignInCode(email, beforeResend);

  await signIn.enterCode(fresh);
  await expect(new CompleteProfilePage(page).getForm()).toBeVisible();
});

test("signing in returns to the page that required it", async ({ page }) => {
  const email = freshEmail("next");
  // A matchmaker this account will never have still proves the redirect
  // honours `next`, hash and all.
  await page.goto("/app/c#somebody.matches");

  const signIn = new SignInPage(page);
  const before = await latestSignInEmail(email);
  await signIn.requestCode(email);
  await signIn.enterCode(await waitForSignInCode(email, before));
  await new CompleteProfilePage(page).submitName("Redirect Tester");

  await expect(page).toHaveURL(/\/app\/c#somebody\.matches$/);
});
