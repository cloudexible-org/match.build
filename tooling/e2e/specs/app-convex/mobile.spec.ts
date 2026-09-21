import { expect, test } from "@playwright/test";
import { uniqueEmail } from "@repo/harness/accounts";
import {
  CandidateChatPage,
  CandidateShellPage,
} from "@repo/harness/page-objects/app/candidate.page";
import { AppHeaderPage } from "@repo/harness/page-objects/app/header.page";
import { InvitePage } from "@repo/harness/page-objects/app/invite.page";
import {
  ConversationPage,
  MatchmakerSettingsPage,
  OnboardPage,
  WorkspacePage,
} from "@repo/harness/page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";

/**
 * The same flows at phone width (prd/phase-1.md §4.1: mobile-first, usable at
 * 380px). Matchmakers work from their phone, so this is the primary layout,
 * not an afterthought.
 *
 * Every test also checks the page doesn't scroll sideways, which is what
 * happens when something is too wide for the viewport.
 */

test.use({ viewport: { width: 380, height: 800 } });

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "jane", name: "Jane Member" },
      // Not in the book, so the accept screen offers them the invitation.
      { key: "outsider", name: "Otto Outsider" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      {
        key: "jane",
        matchmakerKey: "book",
        userKey: "jane",
        membership: "joined",
        name: "Jane Member",
        messages: [{ author: "matchmaker", body: "Welcome Jane!" }],
      },
      { key: "invited", matchmakerKey: "book", name: "Invited Person" },
    ],
  });
});

/** Nothing may overflow the viewport horizontally. */
async function expectNoSidewaysScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("the workspace shows one column at a time, with a way back", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("book"));

  await expect(workspace.getCandidates()).toBeVisible();
  await expect(workspace.getConversation()).toBeHidden();
  await expectNoSidewaysScroll(page);

  await workspace.getCandidateRow("Jane Member").click();
  const conversation = new ConversationPage(page);
  await expect(conversation.getRoot()).toBeVisible();
  await expect(workspace.getCandidates()).toBeHidden();
  await expectNoSidewaysScroll(page);

  await conversation.getBackLink().click();
  await expect(workspace.getCandidates()).toBeVisible();
  await expect(workspace.getConversation()).toBeHidden();
});

test("an invited candidate's link and controls fit the screen", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("invited")}`,
  );

  const conversation = new ConversationPage(page);
  await expect(conversation.getInviteLink()).toBeVisible();
  await expect(conversation.getCopyInviteLinkButton()).toBeVisible();
  await expect(conversation.getResendButton()).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("onboarding works from a phone", async ({ page }) => {
  await signInAs(page, world.email("maya"));
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("book"));
  await workspace.getOnboardLink().click();

  const onboard = new OnboardPage(page);
  await onboard.getEmailInput().fill(uniqueEmail("mobile"));
  await onboard.getNameInput().fill("Phone Onboarded");
  await onboard.addHandle("Instagram", "@phone.person");
  await expectNoSidewaysScroll(page);
  await onboard.getSubmitButton().click();

  await expect(new ConversationPage(page).getCandidateName()).toHaveText(
    "Phone Onboarded",
  );
});

test("the accept screen and a candidate's chat fit the screen", async ({
  page,
}) => {
  await signInAs(page, world.email("jane"));
  await page.goto(`/app/c#${world.username("book")}`);
  await expect(new CandidateChatPage(page).getMatchmakerName()).toBeVisible();
  await expectNoSidewaysScroll(page);

  await signInAs(page, world.email("outsider"));
  await page.goto(world.invitePath("invited"));
  const invite = new InvitePage(page);
  await expect(invite.getAcceptButton()).toBeVisible();
  await expect(invite.getDeclineButton()).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("the candidate shell fits the screen, one column at a time", async ({
  page,
}) => {
  // A candidate lands on the shell rather than home, and on a phone sees
  // the list until they open a conversation.
  await signInAs(page, world.email("jane"));
  const shell = new CandidateShellPage(page);
  await shell.goto();
  await expect(shell.getMatchmakerRow(world.displayName("book"))).toBeVisible();
  await expectNoSidewaysScroll(page);

  await shell.getMatchmakerRow(world.displayName("book")).click();
  const chat = new CandidateChatPage(page);
  await expect(chat.getMatchmakerName()).toBeVisible();
  await expect(shell.getMatchmakerList()).toBeHidden();
  await expectNoSidewaysScroll(page);

  // The third column takes the whole width while it's open, and closes.
  await chat.getPanelToggle().click();
  await expect(chat.getPanel()).toBeVisible();
  await expect(chat.getMatchmakerName()).toBeHidden();
  await expectNoSidewaysScroll(page);
  await page.getByTestId("close-matchmaker-panel").click();
  await expect(chat.getMatchmakerName()).toBeVisible();
});

test("the header's links fold into one menu, and it goes where they went", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("book"));

  // All that is left in the bar is where you are, the bell, the theme and the
  // hamburger. Everything with words on it is behind the last of those.
  const header = new AppHeaderPage(page);
  await expect(workspace.getName()).toBeVisible();
  await expect(header.getMenuButton()).toBeVisible();
  await expect(header.getAccountSettingsLink()).toBeHidden();
  await expect(header.getSignOutButton()).toBeHidden();
  await expectNoSidewaysScroll(page);

  // Whose account these are is the menu's first line — the bar no longer
  // says it anywhere.
  await header.openMenu();
  await expect(header.getMenuAccountName()).toHaveText("Maya Maker");
  await expect(header.getMenuItem("Matches")).toBeVisible();
  await expect(header.getMenuAccountSettings()).toBeVisible();
  await expect(header.getMenuSignOut()).toBeVisible();
  await expectNoSidewaysScroll(page);

  // An item is a real link, and it takes the menu with it.
  await header.getMenuItem("Profile settings").click();
  await expect(new MatchmakerSettingsPage(page).getForm()).toBeVisible();
  await expect(header.getMenu()).toBeHidden();
});
