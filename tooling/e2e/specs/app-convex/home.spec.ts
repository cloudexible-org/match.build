import { expect, test } from "@playwright/test";
import { CandidateShellPage } from "@repo/harness/page-objects/app/candidate.page";
import { AppHeaderPage } from "@repo/harness/page-objects/app/header.page";
import { HomePage } from "@repo/harness/page-objects/app/home.page";
import { InvitePage } from "@repo/harness/page-objects/app/invite.page";
import { WorkspacePage } from "@repo/harness/page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";

/**
 * Where `/app/` sends an account (prd/phase-1.md §2, §4.2). Home only
 * renders when there is something to pick between — a brand-new account
 * choosing its side, or two matchmaker profiles — and every other account
 * goes straight to its one destination:
 *
 * - no profile, but a matchmaker or invitation → `/app/c`, its own chat.
 * - one profile → that workspace.
 *
 * The UI allows one profile per account, so the two-profile case is seeded
 * here rather than created through it.
 *
 * One scenario for the file (see `scenario.ts`), with a separate account per
 * situation, so a test that answers an invitation can't change what another
 * test sees.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "full" }, // owns two profiles, joined one, invited by another
      { key: "single" }, // owns exactly one
      { key: "empty" }, // nothing at all
      { key: "invitee" }, // one open invitation
      { key: "owner" },
      { key: "inviter" },
    ],
    matchmakers: [
      { key: "own", ownerKey: "full", displayName: "Full's Own Book" },
      { key: "own2", ownerKey: "full", displayName: "Full's Second Book" },
      { key: "solo", ownerKey: "single", displayName: "Single's Only Book" },
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

test("two profiles is the one case that still gets the picker", async ({
  page,
}) => {
  await signInAs(page, world.email("full"));
  const home = new HomePage(page);
  await home.goto();

  // Who is signed in: the page greets them, and the header's way into their
  // account settings is there whatever their name is.
  await expect(home.getWelcomeHeading()).toHaveText(
    `Welcome, ${world.users.full.name.split(" ")[0]}`,
  );
  await expect(new AppHeaderPage(page).getAccountSettingsLink()).toBeVisible();
  await expect(
    home.getRow("invitations", world.displayName("inviting")),
  ).toContainText("invited you to join");
  await expect(
    home.getRow("matchmakerProfiles", world.displayName("own")),
  ).toContainText(`@${world.username("own")}`);
  await expect(
    home.getRow("matchmakerProfiles", world.displayName("own2")),
  ).toBeVisible();
  await expect(
    home
      .getRow("candidateProfiles", world.displayName("joined"))
      .getByRole("link"),
  ).toHaveAttribute("href", `/app/c#${world.username("joined")}`);
});

test("one profile opens straight into its workspace", async ({ page }) => {
  await signInAs(page, world.email("single"));
  await new HomePage(page).goto();

  await expect(page).toHaveURL(`/app/mm/${world.username("solo")}`);
  await expect(new WorkspacePage(page).getName()).toHaveText(
    world.displayName("solo"),
  );
});

test("an account with nothing yet is asked which side it is on", async ({
  page,
}) => {
  await signInAs(page, world.email("empty"));
  const home = new HomePage(page);
  await home.goto();

  await expect(page).toHaveURL(/\/app\/$/);
  await expect(home.getWelcomeHeading()).toHaveText(
    `Welcome, ${world.users.empty.name.split(" ")[0]}`,
  );
  await expect(home.getChooseSide()).toBeVisible();
  await expect(home.getChooseMatchmakerLink()).toHaveAttribute(
    "href",
    "/app/mm/new",
  );

  // Looking for a match: the candidate shell, empty and waiting for an
  // invitation, still offering the other way.
  await home.getChooseCandidateLink().click();
  await expect(page).toHaveURL(/\/app\/c$/);
  const shell = new CandidateShellPage(page);
  await expect(shell.getMatchmakerList()).toContainText(
    "You haven't joined a matchmaker yet.",
  );
  await expect(shell.getCreateMatchmakerLink()).toBeVisible();
});

test("an invitation skips the choice and opens the candidate shell", async ({
  page,
}) => {
  await signInAs(page, world.email("invitee"));
  await new HomePage(page).goto();

  await expect(page).toHaveURL(/\/app\/c$/);
  await expect(
    new CandidateShellPage(page).getInvitation(world.displayName("inviting")),
  ).toBeVisible();
});

test("an invitation opens the accept screen", async ({ page }) => {
  // This account owns no profile, so its invitations are in the shell's
  // first column rather than on home.
  await signInAs(page, world.email("invitee"));
  const shell = new CandidateShellPage(page);
  await shell.goto();
  await shell.getInvitation(world.displayName("inviting")).click();

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
  await new AppHeaderPage(page).getSignOutButton().click();

  await expect(page).toHaveURL(/\/app\/sign-in/);
  await page.reload();
  await expect(page).toHaveURL(/\/app\/sign-in/);
});
