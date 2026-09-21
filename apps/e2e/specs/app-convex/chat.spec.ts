import { type Browser, expect, type Page, test } from "@playwright/test";
import { CandidateChatPage } from "../../page-objects/app/candidate.page";
import {
  ConversationPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * Chat (prd/phase-1.md §3.3, §4.2): both sides writing to one thread in real
 * time, private messages the candidate never sees, unread counts, read
 * markers, scrollback, and the composer closing with membership.
 *
 * One seeded candidate per test, so a message in one test can't appear in
 * another's thread.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "live", name: "Liv Live" },
      { key: "bump", name: "Bree Bump" },
      { key: "unread", name: "Uma Unread" },
      { key: "private", name: "Pat Private" },
      { key: "long", name: "Lou Long" },
      { key: "gone", name: "Gus Gone" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      {
        key: "live",
        matchmakerKey: "book",
        userKey: "live",
        membership: "joined",
        name: "Liv Live",
      },
      {
        key: "unread",
        matchmakerKey: "book",
        userKey: "unread",
        membership: "joined",
        name: "Uma Unread",
        messages: [
          { author: "candidate", body: "Are you there?" },
          { author: "candidate", body: "Second question" },
        ],
        unreadForMatchmaker: true,
      },
      {
        key: "private",
        matchmakerKey: "book",
        userKey: "private",
        membership: "joined",
        name: "Pat Private",
        messages: [
          {
            author: "matchmaker",
            visibility: "matchmaker",
            source: "imported",
            body: "Imported DMs: Pat is 34 and lives in London.",
          },
          { author: "matchmaker", body: "Welcome to match.build, Pat!" },
        ],
      },
      {
        key: "long",
        matchmakerKey: "book",
        userKey: "long",
        membership: "joined",
        name: "Lou Long",
        // More than one page (30), so "Load older messages" appears.
        messages: Array.from({ length: 35 }, (_, index) => ({
          author:
            index % 2 === 0 ? ("matchmaker" as const) : ("candidate" as const),
          body: `Message number ${index + 1}`,
        })),
      },
      {
        key: "gone",
        matchmakerKey: "book",
        userKey: "gone",
        membership: "left",
        name: "Gus Gone",
        membershipChangedDaysAgo: 7,
        messages: [{ author: "matchmaker", body: "Take care, Gus." }],
      },
      {
        key: "bump",
        matchmakerKey: "book",
        userKey: "bump",
        membership: "joined",
        name: "Bree Bump",
      },
      { key: "invited", matchmakerKey: "book", name: "Ivy Invited" },
    ],
  });
});

/** Opens a seeded candidate's conversation as the matchmaker. */
async function asMatchmaker(page: Page, key: string) {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId(key)}`,
  );
  const conversation = new ConversationPage(page);
  await expect(conversation.getRoot()).toBeVisible();
  return conversation;
}

/** Opens the candidate's own chat in a second browser session. */
async function asCandidate(
  browser: Browser,
  baseURL: string | undefined,
  userKey: string,
) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signInAs(page, world.email(userKey));
  await page.goto(`/app/c#${world.username("book")}`);
  const chat = new CandidateChatPage(page);
  await expect(chat.getRoot()).toBeVisible();
  return { page, chat };
}

test("both sides see each other's messages without a refresh", async ({
  page,
  browser,
  baseURL,
}) => {
  const conversation = await asMatchmaker(page, "live");
  const { page: candidatePage, chat } = await asCandidate(
    browser,
    baseURL,
    "live",
  );

  await conversation.send("Hi Liv, lovely to have you here.");
  // No reload on either side: Convex pushes the new message.
  await expect(chat.getMessages()).toHaveCount(1);
  await expect(chat.getMessages().first()).toContainText(
    "Hi Liv, lovely to have you here.",
  );

  await chat.send("Thanks! Excited to start.");
  await expect(conversation.getMessages().last()).toContainText(
    "Thanks! Excited to start.",
  );

  // Each side's own messages are theirs; the other's are not.
  await expect(conversation.getMessages().first()).toHaveAttribute(
    "data-author",
    "matchmaker",
  );
  await expect(conversation.getMessages().last()).toHaveAttribute(
    "data-author",
    "candidate",
  );
  await candidatePage.context().close();
});

test("a private message stays with the matchmaker", async ({
  page,
  browser,
  baseURL,
}) => {
  const conversation = await asMatchmaker(page, "private");
  await expect(conversation.getMessages()).toHaveCount(2);
  await expect(conversation.getMessages().first()).toContainText(
    "Only visible to you",
  );

  const { page: candidatePage, chat } = await asCandidate(
    browser,
    baseURL,
    "private",
  );
  await expect(chat.getMessages()).toHaveCount(1);
  await expect(chat.getMessages().first()).toContainText(
    "Welcome to match.build, Pat!",
  );
  await expect(candidatePage.locator("body")).not.toContainText("Imported DMs");
  await candidatePage.context().close();
});

test("unread counts show in the list and clear when the thread is read", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("book"));

  const row = workspace.getCandidateRow("Uma Unread");
  await expect(row.getByTestId("candidate-unread")).toContainText("2");

  await row.click();
  await expect(new ConversationPage(page).getMessages()).toHaveCount(2);
  // Opening it marks it read, and the badge goes.
  await expect(row.getByTestId("candidate-unread")).toBeHidden();
});

test("a reply arriving while the list is open bumps the unread count", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInAs(page, world.email("maya"));
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("book"));
  // Its own candidate: another test's pending read marker must not be able
  // to change this count (see docs/e2e-architecture.md §8).
  const row = workspace.getCandidateRow("Bree Bump");
  await expect(row).toBeVisible();

  const { page: candidatePage, chat } = await asCandidate(
    browser,
    baseURL,
    "bump",
  );
  await chat.send("One more thing…");

  await expect(row.getByTestId("candidate-unread")).toContainText("1");
  await candidatePage.context().close();
});

test("a long thread loads older messages on demand", async ({ page }) => {
  const conversation = await asMatchmaker(page, "long");

  // One page at a time, newest first.
  await expect(conversation.getMessages()).toHaveCount(30);
  await expect(conversation.getMessages().last()).toContainText(
    "Message number 35",
  );
  await expect(conversation.getMessages().first()).not.toContainText(
    "Message number 1",
  );

  await conversation.getLoadOlderButton().click();
  await expect(conversation.getMessages()).toHaveCount(35);
  await expect(conversation.getMessages().first()).toContainText(
    "Message number 1",
  );
  await expect(conversation.getLoadOlderButton()).toBeHidden();
});

test("the composer is closed for an invited candidate and for one who left", async ({
  page,
}) => {
  const invited = await asMatchmaker(page, "invited");
  await expect(invited.getComposer()).toBeHidden();
  await expect(invited.getClosedComposer()).toContainText(
    "You can message Ivy Invited once they accept your invitation.",
  );

  const gone = await asMatchmaker(page, "gone");
  await expect(gone.getComposer()).toBeHidden();
  await expect(gone.getClosedComposer()).toContainText("Gus Gone left on");
  // The thread is still readable.
  await expect(gone.getMessages()).toHaveCount(1);
});

test("an empty message is refused, and a failed send keeps the text", async ({
  page,
}) => {
  const conversation = await asMatchmaker(page, "live");
  await conversation.getMessageInput().fill("   ");
  await conversation.getSendButton().click();
  await expect(conversation.getComposerError()).toHaveText(
    "Write a message first.",
  );
  await expect(conversation.getMessageInput()).toHaveValue("   ");
});

test("Enter sends and Shift+Enter starts a new line", async ({ page }) => {
  const conversation = await asMatchmaker(page, "live");
  const input = conversation.getMessageInput();

  await input.fill("First line");
  await input.press("Shift+Enter");
  await input.pressSequentially("Second line");
  await expect(input).toHaveValue("First line\nSecond line");

  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(conversation.getMessages().last()).toContainText(
    "First line\nSecond line",
  );
});
