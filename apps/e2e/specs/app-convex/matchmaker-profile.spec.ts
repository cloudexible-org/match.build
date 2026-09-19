import { expect, type Page, test } from "@playwright/test";
import { SEED_MATCHMAKERS } from "../../../../packages/api/convex/seed/e2e/fixture";
import { HomePage } from "../../page-objects/app/home.page";
import {
  CreateMatchmakerPage,
  MatchmakerSettingsPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import {
  CompleteProfilePage,
  SignInPage,
} from "../../page-objects/app/sign-in.page";
import { latestSignInEmail, waitForSignInCode } from "../../sign-in-codes";

/**
 * Creating a matchmaker profile, opening its workspace and editing it
 * (prd/phase-1.md §1, §4), against the seeded local backend.
 *
 * Parallel-safe: each test signs up a fresh account, and the profile it
 * creates has a username unique to this run.
 */

function unique(label: string): string {
  return `${label}.${process.pid}.${Date.now()}`;
}

async function signUp(page: Page, label: string, name: string) {
  const email = `new.${unique(label)}@matchmaker-e2e.test`;
  const signIn = new SignInPage(page);
  await signIn.goto();
  const before = await latestSignInEmail(email);
  await signIn.requestCode(email);
  await signIn.enterCode(await waitForSignInCode(email, before));
  await new CompleteProfilePage(page).submitName(name);
}

const seeded = (slug: string) => {
  const found = SEED_MATCHMAKERS.find((m) => m.slug === slug);
  if (!found) throw new Error(`No seed matchmaker "${slug}"`);
  return found;
};

test("a new account creates a matchmaker profile, opens it, and edits it", async ({
  page,
}) => {
  await signUp(page, "mmcreate", "Maya Maker");
  // Lowercase letters and digits only: a valid username, short enough.
  const username = `e2e.${Date.now().toString(36)}${process.pid}`;

  const home = new HomePage(page);
  await home.getCreateMatchmakerLink().click();

  const create = new CreateMatchmakerPage(page);
  await expect(create.getForm()).toBeVisible();

  // The server's rules, checked live once the field has been left.
  await create.getUsernameInput().fill("No.Reply");
  await create.getDisplayNameInput().focus();
  await expect(create.getError("That username isn't available.")).toBeVisible();
  await create.getUsernameInput().fill("jane..smith");
  await expect(
    create.getError("A username can't have two periods in a row."),
  ).toBeVisible();

  // Taken is only known to the server — here under another dot placement.
  const taken = seeded("own").username.replaceAll(".", "");
  await create.create({ username: taken, displayName: "Maya" });
  await expect(create.getError("That username is taken.")).toBeVisible();

  await create.create({
    username: `  ${username.toUpperCase()} `,
    displayName: "  Maya   Matches ",
  });

  const workspace = new WorkspacePage(page);
  await expect(page).toHaveURL(new RegExp(`/app/mm/${username}$`));
  await expect(workspace.getName()).toHaveText("Maya Matches");
  await expect(workspace.getCandidates()).toContainText("No candidates yet");

  // Any case or dot placement lands on the chosen form.
  await workspace.goto(`${username.replace(".", "").toUpperCase()}/settings`);
  await expect(page).toHaveURL(new RegExp(`/app/mm/${username}/settings$`));

  const settings = new MatchmakerSettingsPage(page);
  await expect(settings.getUsername()).toHaveText(username);
  await expect(settings.getDisplayNameInput()).toHaveValue("Maya Matches");
  await settings.save({
    displayName: "Maya's Matches",
    businessName: "Maya & Co",
  });
  await expect(settings.getStatus()).toHaveText("Saved.");
  await expect(workspace.getName()).toHaveText("Maya's Matches");

  const history = settings.getHistoryEntries();
  await expect(history).toHaveCount(2);
  await expect(history.first()).toContainText(
    "Changed display name from “Maya Matches” to “Maya's Matches”",
  );
  await expect(history.first()).toContainText(
    "Set business name to “Maya & Co”",
  );
  await expect(history.last()).toContainText("Created the profile");

  // One profile per account in the UI: home drops the button, and the
  // create page sends the account to its workspace instead.
  await home.goto();
  await expect(
    home.getRow("matchmakerProfiles", "Maya's Matches"),
  ).toContainText(`@${username}`);
  await expect(home.getCreateMatchmakerLink()).toBeHidden();
  await create.goto();
  await expect(page).toHaveURL(new RegExp(`/app/mm/${username}$`));

  // Mobile-first: at phone width only the candidate list shows.
  await page.setViewportSize({ width: 380, height: 800 });
  await expect(workspace.getCandidates()).toBeVisible();
  await expect(workspace.getConversation()).toBeHidden();
});

test("someone else's workspace and a username nobody has look the same", async ({
  page,
}) => {
  await signUp(page, "mmstranger", "Sam Stranger");
  const workspace = new WorkspacePage(page);

  await workspace.goto(seeded("joined").username);
  await expect(workspace.getNotFound()).toBeVisible();
  await expect(workspace.getRoot()).toBeHidden();

  await workspace.goto(`${seeded("own").username}/settings`);
  await expect(workspace.getNotFound()).toBeVisible();

  await workspace.goto("nobody.has.this.name");
  await expect(workspace.getNotFound()).toBeVisible();
});
