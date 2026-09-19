import { expect, test } from "@playwright/test";
import {
  SEED_MATCHMAKERS,
  SEED_USERS,
} from "../../../../packages/api/convex/seed/e2e/fixture";
import { HomePage } from "../../page-objects/app/home.page";
import { SignInPage } from "../../page-objects/app/sign-in.page";
import { latestSignInEmail, waitForSignInCode } from "../../sign-in-codes";

/**
 * A returning account's home page, against the seeded local backend.
 *
 * The `returning` seed user owns a matchmaker profile, has joined another
 * matchmaker, and has a pending invitation from a third — one row in each
 * section. It is signed into by this spec only (see the note in `fixture.ts`
 * on why seeded users are never shared between specs).
 */

const user = SEED_USERS.find((u) => u.slug === "returning");
const profile = (slug: string) => {
  const found = SEED_MATCHMAKERS.find((m) => m.slug === slug);
  if (!found) throw new Error(`No seed matchmaker "${slug}"`);
  return found;
};

test("a returning account sees its profiles, memberships and invitations, then signs out", async ({
  page,
}) => {
  if (!user) throw new Error("No seed user 'returning'");

  const signIn = new SignInPage(page);
  await signIn.goto();
  const before = await latestSignInEmail(user.email);
  await signIn.requestCode(user.email);
  await signIn.enterCode(await waitForSignInCode(user.email, before));

  // An existing account with a name goes straight home — no name step.
  const home = new HomePage(page);
  await expect(home.getAccountName()).toHaveText(user.name);

  const own = profile("own");
  const ownRow = home.getRow("matchmakerProfiles", own.displayName);
  await expect(ownRow).toContainText(`@${own.username}`);
  await expect(ownRow.getByRole("link")).toHaveAttribute(
    "href",
    `/app/mm/${own.username}`,
  );

  const joined = profile("joined");
  await expect(
    home.getRow("candidateProfiles", joined.displayName).getByRole("link"),
  ).toHaveAttribute("href", `/app/c/${joined.username}`);

  await expect(
    home.getRow("invitations", profile("inviting").displayName),
  ).toContainText("invited you to join");

  await home.getSignOutButton().click();
  await expect(signIn.getEmailForm()).toBeVisible();
  await page.reload();
  await expect(signIn.getEmailForm()).toBeVisible();
});
