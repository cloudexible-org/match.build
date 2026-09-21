import { type Browser, expect, type Page, test } from "@playwright/test";
import { waitForDeletionCode, wrongCode } from "../../deletion-codes";
import { AccountSettingsPage } from "../../page-objects/app/account-settings.page";
import {
  CandidateChatPage,
  CandidateShellPage,
} from "../../page-objects/app/candidate.page";
import { CandidatePanelPage } from "../../page-objects/app/candidate-panel.page";
import { ConversationPage } from "../../page-objects/app/matchmaker.page";
import { SignInPage } from "../../page-objects/app/sign-in.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * Leaving a matchmaker and deleting an account (prd/phase-1.md §3.4, §3.5).
 *
 * Both are one-way doors, so each test owns the candidate or account it ends:
 * nothing here can be re-used by another test, and nothing another test does
 * can change what these assert.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "rose", name: "Rose Runner" },
      { key: "lea", name: "Lea Leaver" },
      { key: "bye", name: "Bea Byegone" },
      { key: "stay", name: "Stan Stay" },
      { key: "del", name: "Dee Leted" },
      { key: "guess", name: "Guy Guesser" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
      { key: "other", ownerKey: "rose", displayName: "Rose's Book" },
    ],
    candidates: [
      {
        key: "lea",
        matchmakerKey: "book",
        userKey: "lea",
        membership: "joined",
        name: "Lea Leaver",
        messages: [{ author: "matchmaker", body: "Lovely to meet you, Lea." }],
      },
      // Its own candidate: the test above ends Lea's membership, and a test
      // that writes owns its rows (docs/e2e-architecture.md §8).
      {
        key: "bye",
        matchmakerKey: "book",
        userKey: "bye",
        membership: "joined",
        name: "Bea Byegone",
        messages: [{ author: "matchmaker", body: "Lovely to meet you, Bea." }],
        profile: { notes: { matchmakerNotes: "Loves hiking." } },
      },
      {
        key: "stay",
        matchmakerKey: "book",
        userKey: "stay",
        membership: "joined",
        name: "Stan Stay",
      },
      // The same person with two matchmakers: deleting the account must reach
      // both, and neither may learn about the other.
      {
        key: "delBook",
        matchmakerKey: "book",
        userKey: "del",
        membership: "joined",
        name: "Dee Leted",
        messages: [{ author: "matchmaker", body: "Welcome, Dee." }],
      },
      {
        key: "delOther",
        matchmakerKey: "other",
        userKey: "del",
        membership: "joined",
        name: "Dee Leted",
      },
      {
        key: "guess",
        matchmakerKey: "book",
        userKey: "guess",
        membership: "joined",
        name: "Guy Guesser",
      },
    ],
  });
});

/** Opens a candidate's own chat with Maya, signed in as them. */
async function asCandidate(page: Page, userKey: string) {
  await signInAs(page, world.email(userKey));
  await page.goto(`/app/c#${world.username("book")}`);
  const chat = new CandidateChatPage(page);
  await expect(chat.getRoot()).toBeVisible();
  return chat;
}

/** Opens a seeded candidate's conversation as its matchmaker. */
async function asMatchmaker(
  browser: Browser,
  baseURL: string | undefined,
  ownerKey: "maya" | "rose",
  matchmakerKey: "book" | "other",
  candidateKey: string,
) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signInAs(page, world.email(ownerKey));
  await page.goto(
    `/app/mm/${world.username(matchmakerKey)}/c/${world.candidateId(candidateKey)}`,
  );
  const conversation = new ConversationPage(page);
  await expect(conversation.getRoot()).toBeVisible();
  return { page, conversation };
}

test("leaving takes the conversation away from the candidate", async ({
  page,
}) => {
  const chat = await asCandidate(page, "lea");
  await expect(chat.getComposer()).toBeVisible();

  await chat.leave("Met someone, thank you!");

  // Straight back to the shell, with that matchmaker gone from the column
  // and no conversation left to open.
  const shell = new CandidateShellPage(page);
  await expect(shell.getNoConversations()).toBeVisible();
  await expect(shell.getMatchmakerRow(world.displayName("book"))).toBeHidden();

  // And the URL no longer resolves — the same answer a stranger gets.
  await page.goto(`/app/c#${world.username("book")}`);
  await expect(chat.getNotFound()).toBeVisible();
});

test("the matchmaker keeps the thread, sees why, and can re-invite", async ({
  page,
  browser,
  baseURL,
}) => {
  const { page: mmPage, conversation } = await asMatchmaker(
    browser,
    baseURL,
    "maya",
    "book",
    "bye",
  );
  await expect(conversation.getComposer()).toBeVisible();

  const chat = await asCandidate(page, "bye");
  await chat.leave("Met someone, thank you!");

  // No refresh: the banner, the closed composer and the thread update live.
  await expect(conversation.getMembershipBanner()).toContainText(
    "Bea Byegone left on",
  );
  await expect(conversation.getComposer()).toBeHidden();
  await expect(conversation.getClosedComposer()).toContainText(
    "Bea Byegone left on",
  );
  await expect(conversation.getMessages()).toHaveCount(1);

  // Their reason is in the History, and the profile is still the matchmaker's.
  const panel = new CandidatePanelPage(mmPage);
  await panel.openSection("History");
  await expect(panel.getHistoryEntries().first()).toContainText("Left");
  await expect(panel.getHistoryEntries().first()).toContainText(
    "Met someone, thank you!",
  );
  await panel.openSection("Profile");
  await expect(panel.getNote("matchmakerNotes")).toContainText("Loves hiking");

  // And they can invite her back.
  await conversation.getReinviteButton().click();
  await expect(conversation.getMembershipBanner()).toContainText(
    "Invited · not joined yet",
  );
  await mmPage.context().close();
});

test("changing your mind leaves everything as it was", async ({ page }) => {
  const chat = await asCandidate(page, "stay");
  await (await chat.openLeave()).click();
  await expect(chat.getLeaveConfirmation()).toContainText(
    "Maya's Book keeps their copy",
  );

  await chat.getStayButton().click();
  await expect(chat.getLeaveConfirmation()).toBeHidden();
  await expect(chat.getComposer()).toBeVisible();
  await chat.send("Still here!");
  await expect(chat.getMessages().last()).toContainText("Still here!");
});

test("deleting an account takes the emailed code", async ({ page }) => {
  const email = world.email("guess");
  await signInAs(page, email);
  const settings = new AccountSettingsPage(page);
  await settings.goto();
  await expect(settings.getHeading()).toBeVisible();
  await expect(settings.getEmail()).toHaveText(email);

  await settings.getDeleteStartButton().click();
  const code = await waitForDeletionCode(email);
  await expect(settings.getDeleteForm()).toContainText(`Sent to ${email}`);

  // A wrong code refuses and nothing is deleted.
  await settings.confirmDeletion(wrongCode(code));
  await expect(settings.getError(/That code didn't work/)).toBeVisible();
  await expect(settings.getHeading()).toBeVisible();

  await settings.confirmDeletion(code);

  // Signed out, told plainly what happened, and the app is closed to them.
  await expect(new SignInPage(page).getEmailInput()).toBeVisible();
  await expect(page.getByTestId("account-deleted-notice")).toContainText(
    "keep their copy of past conversations",
  );
  await page.goto("/app/");
  await expect(new SignInPage(page).getEmailInput()).toBeVisible();
});

test("every matchmaker of a deleted account is told, in their own records", async ({
  page,
  browser,
  baseURL,
}) => {
  const maya = await asMatchmaker(browser, baseURL, "maya", "book", "delBook");
  const rose = await asMatchmaker(
    browser,
    baseURL,
    "rose",
    "other",
    "delOther",
  );

  const email = world.email("del");
  await signInAs(page, email);
  const settings = new AccountSettingsPage(page);
  await settings.goto();
  await settings.getDeleteStartButton().click();
  await settings.confirmDeletion(await waitForDeletionCode(email));
  await expect(page.getByTestId("account-deleted-notice")).toBeVisible();

  for (const { conversation } of [maya, rose]) {
    await expect(conversation.getMembershipBanner()).toContainText(
      "Dee Leted deleted their account on",
    );
    await expect(conversation.getComposer()).toBeHidden();
  }
  // Maya keeps her thread with Dee, and learns nothing about Rose.
  await expect(maya.conversation.getMessages()).toHaveCount(1);
  await expect(maya.page.locator("body")).not.toContainText("Rose");
  await maya.page.context().close();
  await rose.page.context().close();
});

test("an account with a matchmaker profile can't be deleted here", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  const settings = new AccountSettingsPage(page);
  await settings.goto();
  await expect(settings.getDeleteCard()).toContainText("can't be deleted here");
  await expect(settings.getDeleteStartButton()).toBeHidden();
});
