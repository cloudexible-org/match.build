import { expect, test } from "@playwright/test";
import { signInToAdmin } from "@repo/harness/accounts";
import { ErasurePage } from "@repo/harness/page-objects/admin/erasure.page";
import { AdminLayout } from "@repo/harness/page-objects/admin/layout.page";
import { CandidatePanelPage } from "@repo/harness/page-objects/app/candidate-panel.page";
import { ConversationPage } from "@repo/harness/page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { SEED_ADMINS } from "@repo/harness/seed";
import { signInAs } from "@repo/harness/session";

/**
 * Erasure requests (prd/phase-1.md §12): the admin erases a person, and the
 * matchmaker's record of working with them survives it.
 *
 * Two apps in one spec — the admin does the erasing, the matchmaker sees the
 * result — so the matchmaker's side runs in a context pointed at apps/app.
 * The admin comes from the shared fixture (they are in
 * `PLATFORM_ADMIN_EMAILS`); the person being erased is seeded per file,
 * because erasing them is destructive and nothing else may depend on them.
 */

const admin = SEED_ADMINS.find((entry) => entry.slug === "admin-erasure");

function appUrl(): string {
  const port = process.env.E2E_APP_PORT;
  if (!port) throw new Error("E2E_APP_PORT is unset — run via Playwright.");
  return `http://127.0.0.1:${port}`;
}

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "jane", name: "Jane Doe" },
      { key: "keep", name: "Kay Keeper" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      {
        key: "jane",
        matchmakerKey: "book",
        userKey: "jane",
        membership: "left",
        name: "Jane Doe",
        leaveReason: "Met someone, thank you!",
        membershipChangedDaysAgo: 4,
        socialHandles: [{ platform: "instagram", handle: "jane.doe" }],
        messages: [
          { author: "matchmaker", body: "Lovely to meet you, Jane." },
          { author: "candidate", body: "Looking for someone kind." },
        ],
        // The facts an erasure has to reach, the ones it must leave, and a
        // note in the matchmaker's own words it never touches.
        profile: {
          facts: { dateOfBirth: "1990-04-02", wantsKids: "yes" },
          notes: { matchmakerNotes: "Great first call. Introduce to Sam." },
        },
      },
      // Untouched by the erasure, so the book is visibly not wiped.
      {
        key: "keep",
        matchmakerKey: "book",
        userKey: "keep",
        membership: "joined",
        name: "Kay Keeper",
      },
    ],
  });
});

test("an erased person leaves the matchmaker's record of them standing", async ({
  page,
  browser,
}) => {
  if (admin === undefined) throw new Error("No admin-erasure seed user.");
  const janeEmail = world.email("jane");

  // The matchmaker's view before: her name, her handle, her reason.
  const context = await browser.newContext({ baseURL: appUrl() });
  const appPage = await context.newPage();
  await signInAs(appPage, world.email("maya"));
  await appPage.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("jane")}`,
  );
  const conversation = new ConversationPage(appPage);
  await expect(conversation.getCandidateName()).toHaveText("Jane Doe");
  await expect(conversation.getMessages()).toHaveCount(2);

  // The admin erases her. Reached through the nav rather than a `goto`:
  // signing in is still in flight when `signInToAdmin` returns, and
  // navigating away would abort it.
  await signInToAdmin(page, admin.email);
  const erasure = new ErasurePage(page);
  await new AdminLayout(page).getNavLink("Erasure").click();
  await expect(erasure.getHeading()).toBeVisible();
  await erasure.choose(janeEmail);
  await expect(erasure.getConfirm()).toBeVisible();

  // The address has to be typed back exactly.
  await erasure.confirm(`${janeEmail}x`);
  await expect(
    erasure.getError(/Type the account's email address exactly/),
  ).toBeVisible();
  await erasure.confirm(janeEmail);
  await expect(erasure.getDone()).toContainText("1 matchmaker's record");

  // The matchmaker's side, reloaded: the person is gone, the work is not.
  await appPage.reload();
  await expect(conversation.getCandidateName()).toHaveText("Erased candidate");
  await expect(appPage.locator("body")).not.toContainText("Jane Doe");
  await expect(appPage.locator("body")).not.toContainText("jane.doe");
  await expect(conversation.getMessages()).toHaveCount(2);
  await expect(conversation.getMessages().last()).toContainText(
    "Looking for someone kind.",
  );

  // Their profile: who she was is gone, what the matchmaker was working with
  // stays, and their own words are untouched. Then a history that explains the
  // change and has lost her reason for leaving but kept everything that
  // happened.
  const panel = new CandidatePanelPage(appPage);
  await panel.openSection("Profile");
  await expect(panel.getField("dateOfBirth")).toContainText("[erased]");
  await expect(panel.getField("wantsKids")).toContainText("yes");
  await expect(panel.getNote("matchmakerNotes")).toContainText(
    "Introduce to Sam",
  );
  await panel.openSection("History");
  await expect(panel.getHistoryEntries().first()).toContainText("Anonymised");
  const history = panel.getHistoryEntries();
  await expect(history.filter({ hasText: "Left" })).not.toHaveCount(0);
  await expect(history.filter({ hasText: "Met someone" })).toHaveCount(0);

  // And the rest of the book is untouched.
  await appPage.goto(`/app/mm/${world.username("book")}`);
  await expect(appPage.getByText("Kay Keeper")).toBeVisible();
  await context.close();
});

test("an account that owns a matchmaker profile is refused", async ({
  page,
}) => {
  if (admin === undefined) throw new Error("No admin-erasure seed user.");
  await signInToAdmin(page, admin.email);
  const erasure = new ErasurePage(page);
  await new AdminLayout(page).getNavLink("Erasure").click();
  await expect(erasure.getHeading()).toBeVisible();
  await erasure.choose(world.email("maya"));
  await erasure.confirm(world.email("maya"));
  await expect(erasure.getError(/owns a matchmaker profile/)).toBeVisible();
});
