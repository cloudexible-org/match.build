import { expect, test } from "@playwright/test";
import { CandidateChatPage } from "@repo/harness/page-objects/app/candidate.page";
import {
  ConversationPage,
  WorkspacePage,
} from "@repo/harness/page-objects/app/matchmaker.page";
import { NotificationsPage } from "@repo/harness/page-objects/app/notifications.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";

/**
 * The notifications panel under the bell (`convex/notifications/queries.ts`).
 *
 * The unit suite covers what the list contains and when an item is new. What
 * only a real backend can show is the loop the person is actually in: someone
 * writes, the bell counts it, opening the panel quiets the bell *without*
 * marking the conversation read, and following the item lands on the thread.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "writer", name: "Wren Writer" },
      { key: "reader", name: "Remy Reader" },
      { key: "invitee", name: "Ivy Invitee" },
      { key: "joiner", name: "Jo Joiner" },
      { key: "quiet", name: "Quinn Quiet" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      // Joined two months ago, so their memberships are no longer news and
      // these two are in the panel for their messages alone.
      {
        key: "writer",
        matchmakerKey: "book",
        userKey: "writer",
        membership: "joined",
        membershipChangedDaysAgo: 60,
        name: "Wren Writer",
      },
      {
        key: "reader",
        matchmakerKey: "book",
        userKey: "reader",
        membership: "joined",
        membershipChangedDaysAgo: 60,
        name: "Remy Reader",
      },
      // Joined just now, which is news to Maya and nothing to anyone else.
      {
        key: "joiner",
        matchmakerKey: "book",
        userKey: "joiner",
        membership: "joined",
        name: "Jo Joiner",
      },
      {
        key: "invitee",
        matchmakerKey: "book",
        userKey: "invitee",
        membership: "invited",
        name: "Ivy Invitee",
      },
    ],
  });
});

/** The candidate writes to their matchmaker, from their own shell. */
async function writeAsCandidate(
  page: import("@playwright/test").Page,
  userKey: string,
  body: string,
) {
  await signInAs(page, world.email(userKey));
  await page.goto(`/app/c#${world.username("book")}`);
  const chat = new CandidateChatPage(page);
  await expect(chat.getRoot()).toBeVisible();
  await chat.send(body);
}

test("a candidate's message reaches the matchmaker's bell, naming them and not the message", async ({
  page,
  browser,
  baseURL,
}) => {
  const theirs = await browser.newContext({ baseURL });
  await writeAsCandidate(
    await theirs.newPage(),
    "writer",
    "I have been seeing a therapist about it",
  );

  await signInAs(page, world.email("maya"));
  await page.goto("/app");
  const bell = new NotificationsPage(page);
  // Two things waiting, from two sources: Wren's message, and Jo joining.
  await expect(bell.getBadge()).toHaveText("2");

  await bell.open();
  const item = bell.getItem("Wren Writer");
  await expect(item).toBeVisible();
  await expect(item).toContainText("Sent you a message");
  await expect(bell.getItem("Jo Joiner")).toContainText(
    "Accepted your invitation",
  );
  // §8's rule holds here too: who wrote, never what they wrote.
  await expect(bell.getPanel()).not.toContainText("therapist");
  await theirs.close();
});

test("opening the panel quiets the bell but leaves the conversation unread", async ({
  page,
  browser,
  baseURL,
}) => {
  const theirs = await browser.newContext({ baseURL });
  await writeAsCandidate(await theirs.newPage(), "reader", "Are you there?");

  await signInAs(page, world.email("maya"));
  await page.goto(`/app/mm/${world.username("book")}`);
  const bell = new NotificationsPage(page);
  await bell.open();
  // New as it opened, and it stays marked new while it is on screen.
  await expect(
    bell.getNewItems().filter({ hasText: "Remy Reader" }),
  ).toBeVisible();
  await expect(bell.getBadge()).toHaveCount(0);

  // The workspace still says the message is waiting: seen is not read.
  const workspace = new WorkspacePage(page);
  await expect(workspace.getCandidateRow("Remy Reader")).toContainText("1");

  // Opened again, nothing is new any more — but the message still is.
  await page.reload();
  await expect(bell.getBadge()).toHaveCount(0);
  await bell.open();
  await expect(bell.getItem("Remy Reader")).toBeVisible();
  await expect(bell.getNewItems()).toHaveCount(0);
  await theirs.close();
});

test("following a notification opens that conversation, and reading it clears the item", async ({
  page,
  browser,
  baseURL,
}) => {
  const theirs = await browser.newContext({ baseURL });
  await writeAsCandidate(await theirs.newPage(), "writer", "Thursday works");

  await signInAs(page, world.email("maya"));
  await page.goto("/app");
  const bell = new NotificationsPage(page);
  await bell.open();
  await bell.getItem("Wren Writer").click();

  const conversation = new ConversationPage(page);
  await expect(conversation.getRoot()).toBeVisible();
  await expect(conversation.getMessages().last()).toContainText(
    "Thursday works",
  );
  await expect(page).toHaveURL(
    new RegExp(`/app/mm/${world.username("book")}/c/`),
  );

  // Read, so there is nothing left waiting.
  await bell.open();
  await expect(bell.getItem("Wren Writer")).toHaveCount(0);
  await theirs.close();
});

test("a candidate is told about their matchmaker's reply", async ({
  page,
  browser,
  baseURL,
}) => {
  const mayas = await browser.newContext({ baseURL });
  const mayasPage = await mayas.newPage();
  await signInAs(mayasPage, world.email("maya"));
  await mayasPage.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("reader")}`,
  );
  const conversation = new ConversationPage(mayasPage);
  await expect(conversation.getRoot()).toBeVisible();
  await conversation.send("Remy, I have someone in mind.");

  // Their account settings, not "/app": home sends a candidate straight into
  // their chat, which reads the message and is exactly what must not have
  // happened yet.
  await signInAs(page, world.email("reader"));
  await page.goto("/app/settings");
  const bell = new NotificationsPage(page);
  await expect(bell.getBadge()).toHaveText("1");
  await bell.open();
  await expect(bell.getItem("Maya's Book")).toContainText("Sent you a message");
  await mayas.close();
});

test("an open invitation waits in the invited person's panel", async ({
  page,
}) => {
  await signInAs(page, world.email("invitee"));
  await page.goto("/app");
  const bell = new NotificationsPage(page);
  await bell.open();
  await expect(bell.getItem("Maya's Book")).toContainText(
    "Invited you to connect",
  );
});

test("an account with nothing waiting is told so", async ({ page }) => {
  await signInAs(page, world.email("quiet"));
  await page.goto("/app");
  const bell = new NotificationsPage(page);
  await expect(bell.getBadge()).toHaveCount(0);
  await bell.open();
  await expect(bell.getEmptyState()).toBeVisible();
  await expect(bell.getItems()).toHaveCount(0);
});
