import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "../../a11y";
import { AccountSettingsPage } from "../../page-objects/app/account-settings.page";
import {
  CandidateChatPage,
  DiscoverPage,
} from "../../page-objects/app/candidate.page";
import { HomePage } from "../../page-objects/app/home.page";
import { InvitePage } from "../../page-objects/app/invite.page";
import {
  ConversationPage,
  CreateMatchmakerPage,
  MatchmakerSettingsPage,
  OnboardPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import { SignInPage } from "../../page-objects/app/sign-in.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * An axe-core scan of every screen, against WCAG 2.1 A and AA.
 *
 * Automated rules find only some accessibility problems, but they reliably
 * catch the ones a refactor reintroduces: an input that lost its label, a
 * control with no accessible name, text that fell below contrast. Each test
 * scans a page in a real state, because an empty form hides most of them.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "jane", name: "Jane Member" },
      { key: "outsider", name: "Otto Outsider" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      {
        key: "member",
        matchmakerKey: "book",
        userKey: "jane",
        membership: "joined",
        name: "Jane Member",
        messages: [
          {
            author: "matchmaker",
            visibility: "matchmaker",
            source: "imported",
            body: "Imported: hello from Instagram.",
          },
          { author: "candidate", body: "Looking forward to it!" },
        ],
      },
      { key: "invited", matchmakerKey: "book", name: "Invited Person" },
    ],
  });
});

test("the sign-in screens", async ({ page }) => {
  const signIn = new SignInPage(page);
  await signIn.goto();
  await expectNoA11yViolations(page);

  await signIn.requestCode(world.email("outsider"));
  await expect(signIn.getCodeForm()).toBeVisible();
  await expectNoA11yViolations(page);
});

test("the home page", async ({ page }) => {
  // Home is only for an account that owns a matchmaker profile; a candidate
  // is redirected to the shell, which the chat test below scans.
  await signInAs(page, world.email("maya"));
  const home = new HomePage(page);
  await home.goto();
  await expect(home.getWelcomeHeading()).toBeVisible();
  await expectNoA11yViolations(page);
});

test("creating a matchmaker profile, including its errors", async ({
  page,
}) => {
  await signInAs(page, world.email("outsider"));
  const create = new CreateMatchmakerPage(page);
  await create.goto();
  await expect(create.getForm()).toBeVisible();
  await expectNoA11yViolations(page);

  await create.getUsernameInput().fill("jane..smith");
  await create.getSubmitButton().click();
  await expect(
    create.getError("A username can't have two periods in a row."),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});

test("the workspace and a conversation", async ({ page }) => {
  await signInAs(page, world.email("maya"));
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("book"));
  await expect(workspace.getCandidateRow("Jane Member")).toBeVisible();
  await expectNoA11yViolations(page);

  await workspace.getCandidateRow("Jane Member").click();
  await expect(new ConversationPage(page).getMessages().first()).toBeVisible();
  await expectNoA11yViolations(page);
});

test("an invited candidate's conversation, with the invite controls", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  const conversation = new ConversationPage(page);
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("invited")}`,
  );
  await expect(conversation.getInviteLink()).toBeVisible();
  await expectNoA11yViolations(page);

  await conversation
    .getMembershipBanner()
    .getByRole("button", { name: "Change email" })
    .click();
  await expect(page.getByLabel("New email")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("the onboard form", async ({ page }) => {
  await signInAs(page, world.email("maya"));
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("book"));
  await workspace.getOnboardLink().click();

  const onboard = new OnboardPage(page);
  await onboard.addHandle("WhatsApp", "07700 900123");
  await onboard.getSubmitButton().click();
  await expect(onboard.getError("Enter their email address.")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("profile settings", async ({ page }) => {
  await signInAs(page, world.email("maya"));
  const settings = new MatchmakerSettingsPage(page);
  await settings.goto(world.username("book"));
  await expect(settings.getHistoryEntries().first()).toBeVisible();
  await expectNoA11yViolations(page);
});

test("the accept screen and a candidate's chat", async ({ page }) => {
  await signInAs(page, world.email("outsider"));
  await page.goto(world.invitePath("invited"));
  await expect(new InvitePage(page).getAcceptButton()).toBeVisible();
  await expectNoA11yViolations(page);

  await signInAs(page, world.email("jane"));
  await page.goto(`/app/c#${world.username("book")}`);
  // Wait for the thread: scanning an empty chat misses everything in it.
  await expect(new CandidateChatPage(page).getMessages().first()).toBeVisible();
  await expectNoA11yViolations(page);

  // Discover, where "Join another matchmaker" leads.
  await new DiscoverPage(page).goto();
  await expect(new DiscoverPage(page).getEmptyState()).toBeVisible();
  await expectNoA11yViolations(page);
});

test("account settings, and the screens for leaving or deleting", async ({
  page,
}) => {
  await signInAs(page, world.email("jane"));
  const settings = new AccountSettingsPage(page);
  await settings.goto();
  await expect(settings.getHeading()).toBeVisible();
  await expectNoA11yViolations(page);

  // The code step. Asking for a code deletes nothing.
  await settings.getDeleteStartButton().click();
  await expect(settings.getCodeInput()).toBeVisible();
  await expectNoA11yViolations(page);

  // And the leave confirmation, left unconfirmed.
  await page.goto(`/app/c#${world.username("book")}`);
  const chat = new CandidateChatPage(page);
  await (await chat.openLeave()).click();
  await expect(chat.getLeaveConfirmation()).toBeVisible();
  await expectNoA11yViolations(page);
});
