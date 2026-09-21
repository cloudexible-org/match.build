import { expect, test } from "@playwright/test";
import { CandidateShellPage } from "../../page-objects/app/candidate.page";
import { HomePage } from "../../page-objects/app/home.page";
import { InvitePage } from "../../page-objects/app/invite.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * The home page (prd/phase-1.md §2): invitations, the account's own
 * matchmaker profiles, and the matchmakers it has joined. Only an account
 * that owns a profile sees it — everyone else is sent to their own shell at
 * `/app/c`, which is asserted here too.
 *
 * One scenario for the file (see `scenario.ts`), with a separate account per
 * situation, so a test that answers an invitation can't change what another
 * test sees.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "full" }, // owns a profile, joined one, invited by another
      { key: "empty" }, // nothing at all
      { key: "invitee" }, // one open invitation
      { key: "owner" },
      { key: "inviter" },
    ],
    matchmakers: [
      { key: "own", ownerKey: "full", displayName: "Full's Own Book" },
      { key: "joined", ownerKey: "owner", displayName: "Joined Book" },
      { key: "inviting", ownerKey: "inviter", displayName: "Inviting Book" },
    ],
    candidates: [
      {
        key: "member",
        matchmakerKey: "joined",
        userKey: "full",
        membership: "joined",
      },
      { key: "invite-for-full", matchmakerKey: "inviting", userKey: "full" },
      {
        key: "invite-for-invitee",
        matchmakerKey: "inviting",
        userKey: "invitee",
      },
    ],
  });
});

test("shows an account's invitations, own profiles and matchmakers", async ({
  page,
}) => {
  await signInAs(page, world.email("full"));
  const home = new HomePage(page);
  await home.goto();

  await expect(home.getAccountName()).toHaveText(world.users.full.name);
  await expect(
    home.getRow("invitations", world.displayName("inviting")),
  ).toContainText("invited you to join");
  await expect(
    home.getRow("matchmakerProfiles", world.displayName("own")),
  ).toContainText(`@${world.username("own")}`);
  await expect(
    home
      .getRow("candidateProfiles", world.displayName("joined"))
      .getByRole("link"),
  ).toHaveAttribute("href", `/app/c#${world.username("joined")}`);
});

test("an account with no profile of its own never sees home", async ({
  page,
}) => {
  await signInAs(page, world.email("empty"));
  const home = new HomePage(page);
  await home.goto();

  // Home redirects: there is nothing for this account to choose between.
  await expect(page).toHaveURL(/\/app\/c$/);
  const shell = new CandidateShellPage(page);
  await expect(shell.getMatchmakerList()).toContainText(
    "You haven't joined a matchmaker yet.",
  );
  await expect(shell.getCreateMatchmakerLink()).toBeVisible();
});

test("an invitation opens the accept screen", async ({ page }) => {
  // This account owns no profile, so its invitations are in the shell's
  // first column rather than on home.
  await signInAs(page, world.email("invitee"));
  const shell = new CandidateShellPage(page);
  await shell.goto();
  await shell.getWaitingRow(world.displayName("inviting")).click();

  const invite = new InvitePage(page);
  await expect(invite.getTitle()).toHaveText(
    `${world.displayName("inviting")} invited you to match.build`,
  );
  await expect(page).toHaveURL(
    `/app/invitations/${world.candidateId("invite-for-invitee")}`,
  );
});

test("signing out returns to sign-in, and the session is gone after a reload", async ({
  page,
}) => {
  await signInAs(page, world.email("full"));
  const home = new HomePage(page);
  await home.goto();
  await home.getSignOutButton().click();

  await expect(page).toHaveURL(/\/app\/sign-in/);
  await page.reload();
  await expect(page).toHaveURL(/\/app\/sign-in/);
});
