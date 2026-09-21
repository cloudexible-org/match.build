import { expect, test } from "@playwright/test";
import {
  CandidateChatPage,
  CandidateShellPage,
  DiscoverPage,
} from "../../page-objects/app/candidate.page";
import { InvitePage } from "../../page-objects/app/invite.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * The candidate shell (prd/phase-1.md §4.2): where an account without a
 * matchmaker profile of its own now lands, and how it moves between the
 * matchmakers it has.
 *
 * Read-only: nothing here leaves a matchmaker or answers an invitation
 * (leaving.spec.ts and invitations.spec.ts own those one-way doors), so the
 * tests in this file can share its world.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "rose", name: "Rose Runner" },
      { key: "ida", name: "Ida Inviter" },
      { key: "sam", name: "Sam Candidate" }, // two matchmakers and an invite
      { key: "nora", name: "Nora None" }, // nothing at all
    ],
    matchmakers: [
      {
        key: "book",
        ownerKey: "maya",
        displayName: "Maya Matches",
        businessName: "Maya Matches Ltd",
      },
      { key: "other", ownerKey: "rose", displayName: "Rose's Book" },
      { key: "inviting", ownerKey: "ida", displayName: "Ida's Book" },
    ],
    candidates: [
      {
        key: "samBook",
        matchmakerKey: "book",
        userKey: "sam",
        membership: "joined",
        name: "Sam Candidate",
        messages: [{ author: "matchmaker", body: "Lovely to meet you, Sam." }],
      },
      {
        key: "samOther",
        matchmakerKey: "other",
        userKey: "sam",
        membership: "joined",
        name: "Sam Candidate",
        messages: [{ author: "matchmaker", body: "Hello from Rose." }],
      },
      { key: "samInvite", matchmakerKey: "inviting", userKey: "sam" },
    ],
  });
});

test("a candidate lands straight on a conversation, with everything they have beside it", async ({
  page,
}) => {
  await signInAs(page, world.email("sam"));
  await page.goto("/app/");

  // Home is not a choice they have to make: the first matchmaker opens, and
  // the URL names them.
  const shell = new CandidateShellPage(page);
  const chat = new CandidateChatPage(page);
  await expect(shell.getRoot()).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(
      `/app/c#(${world.username("book")}|${world.username("other")})$`,
    ),
  );
  await expect(chat.getMessages().first()).toBeVisible();

  // Both matchmakers are in the first column, and the open invitation sits
  // above them as a badged card.
  await expect(shell.getMatchmakerRow("Maya Matches")).toBeVisible();
  await expect(shell.getMatchmakerRow("Rose's Book")).toBeVisible();
  const invitation = shell.getInvitation("Ida's Book");
  await expect(invitation).toContainText("Invited");
  await expect(invitation).toContainText("Accept or decline");
});

test("switching matchmakers only swaps the hash and the thread", async ({
  page,
}) => {
  await signInAs(page, world.email("sam"));
  const shell = new CandidateShellPage(page);
  const chat = new CandidateChatPage(page);
  await shell.goto(world.username("book"));

  await expect(chat.getMatchmakerName()).toHaveText("Maya Matches");
  await expect(chat.getMessages()).toContainText(["Lovely to meet you, Sam."]);

  await shell.getMatchmakerRow("Rose's Book").click();
  await expect(page).toHaveURL(`/app/c#${world.username("other")}`);
  await expect(chat.getMatchmakerName()).toHaveText("Rose's Book");
  await expect(chat.getMessages()).toContainText(["Hello from Rose."]);

  // The list never went away while the conversation changed.
  await expect(shell.getMatchmakerRow("Maya Matches")).toBeVisible();
});

test("the third column says who the matchmaker is and what can be done about it", async ({
  page,
}) => {
  await signInAs(page, world.email("sam"));
  const shell = new CandidateShellPage(page);
  const chat = new CandidateChatPage(page);
  await shell.goto(world.username("book"));

  await expect(chat.getPanel()).toContainText("Maya Matches Ltd");
  await expect(chat.getPanel()).toContainText(`@${world.username("book")}`);
  await expect(chat.getPanelMembership()).toContainText("Joined");
  await expect(chat.getNotificationSettingsLink()).toHaveAttribute(
    "href",
    "/app/settings",
  );

  // Leaving starts here, and "Stay" ends it without leaving anything.
  await (await chat.openLeave()).click();
  await expect(chat.getLeaveConfirmation()).toContainText("Leave Maya Matches");
  await chat.getStayButton().click();
  await expect(chat.getLeaveConfirmation()).toBeHidden();
  await expect(chat.getComposer()).toBeVisible();
});

test("an account with no matchmakers still lands here, and waits for an invitation", async ({
  page,
}) => {
  await signInAs(page, world.email("nora"));
  await page.goto("/app/");

  const shell = new CandidateShellPage(page);
  await expect(page).toHaveURL(/\/app\/c$/);
  await expect(shell.getNoConversations()).toBeVisible();
  await expect(shell.getInvitationsSection()).toBeHidden();

  // Becoming a matchmaker is the only thing on offer: in v1 nothing in the
  // UI invites you into someone else's book but that matchmaker.
  await expect(shell.getCreateMatchmakerLink()).toHaveAttribute(
    "href",
    "/app/mm/new",
  );
  await expect(shell.getOwnWorkspaceLink()).toBeHidden();
  await expect(page.getByRole("link", { name: /discover/i })).toHaveCount(0);
});

test("Discover is a shell nothing links to yet", async ({ page }) => {
  await signInAs(page, world.email("nora"));
  const discover = new DiscoverPage(page);
  await discover.goto();

  await expect(discover.getTitle()).toBeVisible();
  await expect(discover.getEmptyState()).toContainText(
    "The directory isn't open yet.",
  );
});

test("a matchmaker this account can't open reads as a dead link", async ({
  page,
}) => {
  await signInAs(page, world.email("nora"));
  const shell = new CandidateShellPage(page);
  await shell.goto(world.username("book"));

  // The same answer whether or not that matchmaker exists (prd §9.2).
  await expect(new CandidateChatPage(page).getNotFound()).toBeVisible();
  await shell.goto("no.such.matchmaker");
  await expect(new CandidateChatPage(page).getNotFound()).toBeVisible();
});

test("the old per-matchmaker URL still opens the conversation", async ({
  page,
}) => {
  await signInAs(page, world.email("sam"));
  // What notification emails sent before this change still say.
  await page.goto(`/app/c/${world.username("book")}`);

  await expect(page).toHaveURL(`/app/c#${world.username("book")}`);
  await expect(new CandidateChatPage(page).getMatchmakerName()).toHaveText(
    "Maya Matches",
  );
});

test("an invitation in the first column opens the accept screen", async ({
  page,
}) => {
  await signInAs(page, world.email("sam"));
  const shell = new CandidateShellPage(page);
  await shell.goto();

  await shell.getInvitation("Ida's Book").click();
  await expect(page).toHaveURL(
    `/app/invitations/${world.candidateId("samInvite")}`,
  );
  await expect(new InvitePage(page).getAcceptButton()).toBeVisible();
});
