import { expect, test } from "@playwright/test";
import { uniqueEmail } from "../../accounts";
import { HomePage } from "../../page-objects/app/home.page";
import {
  CandidateChatPage,
  InvitePage,
} from "../../page-objects/app/invite.page";
import {
  ConversationPage,
  OnboardPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

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
  await page.goto(`/app/c/${world.username("book")}`);
  await expect(new CandidateChatPage(page).getMatchmakerName()).toBeVisible();
  await expectNoSidewaysScroll(page);

  await signInAs(page, world.email("outsider"));
  await page.goto(world.invitePath("invited"));
  const invite = new InvitePage(page);
  await expect(invite.getAcceptButton()).toBeVisible();
  await expect(invite.getDeclineButton()).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("the home page fits the screen", async ({ page }) => {
  await signInAs(page, world.email("jane"));
  const home = new HomePage(page);
  await home.goto();
  await expect(home.getWelcomeHeading()).toBeVisible();
  await expect(
    home.getRow("candidateProfiles", world.displayName("book")),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
});
