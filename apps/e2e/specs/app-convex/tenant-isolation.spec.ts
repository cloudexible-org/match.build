import { expect, test } from "@playwright/test";
import {
  CandidateChatPage,
  InvitePage,
} from "../../page-objects/app/invite.page";
import {
  ConversationPage,
  MatchmakerSettingsPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import { SignInPage } from "../../page-objects/app/sign-in.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * Tenant isolation (prd/phase-1.md §9.1), the guarantee the product is sold
 * on: one matchmaker can never reach another's book, and a candidate can
 * never reach anything but their own conversation.
 *
 * Every check here goes straight to a URL, because that is the attack: the
 * UI never offers these links. A rival's row must answer exactly as a row
 * that doesn't exist, so a URL can't be used to prove someone is in a book.
 *
 * Nothing in this file writes, so its tests share one seeded world.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" }, // owns "book"
      { key: "rival", name: "Rival Maker" }, // owns "rivalbook"
      { key: "jane", name: "Jane Member" }, // Maya's candidate
      { key: "nobody", name: "No Body" }, // no profile, no membership
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
      { key: "rivalbook", ownerKey: "rival", displayName: "Rival's Book" },
    ],
    candidates: [
      {
        key: "jane",
        matchmakerKey: "book",
        userKey: "jane",
        membership: "joined",
        name: "Jane Member",
        notes: ["Private note: only Maya should ever read this."],
        messages: [
          {
            author: "matchmaker",
            visibility: "matchmaker",
            source: "imported",
            body: "Imported DMs: Jane said she is 34 and lives in London.",
          },
          { author: "matchmaker", body: "Welcome Jane!" },
        ],
      },
      { key: "invited", matchmakerKey: "book", name: "Invited Person" },
    ],
  });
});

test("a rival matchmaker can't open another book's workspace or settings", async ({
  page,
}) => {
  await signInAs(page, world.email("rival"));
  const workspace = new WorkspacePage(page);

  await workspace.goto(world.username("book"));
  await expect(workspace.getNotFound()).toBeVisible();

  await new MatchmakerSettingsPage(page).goto(world.username("book"));
  await expect(workspace.getNotFound()).toBeVisible();
});

test("a rival's own workspace can't open another book's candidate", async ({
  page,
}) => {
  await signInAs(page, world.email("rival"));
  const conversation = new ConversationPage(page);

  // A real candidate id, addressed through the rival's own workspace: the
  // same "not found" a made-up id gets.
  await page.goto(
    `/app/mm/${world.username("rivalbook")}/c/${world.candidateId("jane")}`,
  );
  await expect(conversation.getNotFound()).toBeVisible();
  await page.goto(`/app/mm/${world.username("rivalbook")}/c/madeupid`);
  await expect(conversation.getNotFound()).toBeVisible();

  // And nothing of the other book leaks into their list.
  await expect(new WorkspacePage(page).getCandidates()).not.toContainText(
    "Jane Member",
  );
});

test("a candidate can't open the workspace of the matchmaker they joined", async ({
  page,
}) => {
  await signInAs(page, world.email("jane"));
  const workspace = new WorkspacePage(page);

  await workspace.goto(world.username("book"));
  await expect(workspace.getNotFound()).toBeVisible();
  await expect(workspace.getRoot()).toBeHidden();

  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("jane")}`,
  );
  await expect(workspace.getNotFound()).toBeVisible();
  // Their own record's private history is not on the page in any form.
  await expect(page.locator("body")).not.toContainText("Imported DMs");
  await expect(page.locator("body")).not.toContainText("Private note");
});

test("a candidate's own chat shows the matchmaker, not the matchmaker's notes", async ({
  page,
}) => {
  await signInAs(page, world.email("jane"));
  await page.goto(`/app/c/${world.username("book")}`);

  await expect(new CandidateChatPage(page).getMatchmakerName()).toHaveText(
    world.displayName("book"),
  );
  await expect(page.locator("body")).not.toContainText("Imported DMs");
  await expect(page.locator("body")).not.toContainText("Private note");
});

test("an account with nothing can't reach any of it", async ({ page }) => {
  await signInAs(page, world.email("nobody"));
  const workspace = new WorkspacePage(page);

  await workspace.goto(world.username("book"));
  await expect(workspace.getNotFound()).toBeVisible();

  await page.goto(`/app/c/${world.username("book")}`);
  await expect(workspace.getNotFound()).toBeVisible();

  // An invitation addressed to someone else, by candidate id, is invisible.
  await page.goto(`/app/invitations/${world.candidateId("invited")}`);
  await expect(new InvitePage(page).getInvalid()).toBeVisible();
});

test("signed out, every page asks for sign-in and remembers where you were", async ({
  page,
}) => {
  // `next` is a router path: the app is mounted under /app, which the
  // router's basename supplies.
  const route = `/mm/${world.username("book")}`;
  await page.goto(`/app${route}`);

  await expect(new SignInPage(page).getEmailForm()).toBeVisible();
  await expect(page).toHaveURL(
    `/app/sign-in?next=${encodeURIComponent(route)}`,
  );

  await page.goto(`/app/c/${world.username("book")}`);
  await expect(new SignInPage(page).getEmailForm()).toBeVisible();
});
