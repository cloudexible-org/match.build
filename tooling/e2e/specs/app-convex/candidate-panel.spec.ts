import { expect, type Page, test } from "@playwright/test";
import { CandidatePanelPage } from "@repo/harness/page-objects/app/candidate-panel.page";
import { ConversationPage } from "@repo/harness/page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";

/**
 * The candidate panel (prd/phase-1.md §4.1, §5.2; prd/phase-2.md §3, §5): the
 * Details, Profile and History sections, the last one over the audit trail.
 *
 * One seeded candidate per test that writes, so an edit in one test can't
 * change what another sees.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "jane", name: "Jane Account" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      {
        key: "details",
        matchmakerKey: "book",
        name: "Dana Details",
        socialHandles: [{ platform: "instagram", handle: "dana.details" }],
      },
      { key: "status", matchmakerKey: "book", name: "Stan Status" },
      {
        key: "handles",
        matchmakerKey: "book",
        name: "Holly Handles",
        socialHandles: [{ platform: "instagram", handle: "holly.handles" }],
      },
      {
        key: "history",
        matchmakerKey: "book",
        name: "Hugo History",
        userKey: "jane",
        membership: "joined",
        profile: { notes: { matchmakerNotes: "Seeded note" } },
      },
    ],
  });
});

/** Opens a candidate's conversation with the panel showing. */
async function openPanel(page: Page, key: string) {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId(key)}`,
  );
  await expect(new ConversationPage(page).getRoot()).toBeVisible();
  const panel = new CandidatePanelPage(page);
  await expect(panel.getRoot()).toBeVisible();
  return panel;
}

test("Details shows who they are and saves an edit", async ({ page }) => {
  const panel = await openPanel(page, "details");

  // It reads as a record: a line each, and the editable ones are a row you
  // click rather than a box that is always open.
  await expect(panel.getNameRow()).toContainText("Dana Details");
  await expect(panel.getEmail()).toHaveText(world.candidates.details.email);
  await expect(panel.getMembership()).toHaveText("Invited");
  await expect(panel.getHandle("instagram")).toContainText("dana.details");

  await panel.setName("Dana Renamed");

  // The row closes on the new value — that is the confirmation — and the
  // rest of the workspace follows.
  await expect(panel.getNameRow()).toContainText("Dana Renamed");
  await expect(panel.getNameInput()).toBeHidden();
  await expect(new ConversationPage(page).getCandidateName()).toHaveText(
    "Dana Renamed",
  );
  await page.reload();
  await expect(panel.getNameRow()).toContainText("Dana Renamed");
});

test("an editable row says so without being hovered", async ({ page }) => {
  const panel = await openPanel(page, "details");

  // Hover is not something a touch screen has, so an affordance that only
  // appears under a pointer is an affordance a phone never sees.
  const hint = panel.getNameRow().getByTestId("row-edit-hint");
  await expect(hint).toBeVisible();
  expect(
    Number(await hint.evaluate((node) => getComputedStyle(node).opacity)),
  ).toBeGreaterThan(0.2);

  // And a row nothing can change here does not offer one.
  await expect(
    panel.getDetail("membership").getByTestId("row-edit-hint"),
  ).toHaveCount(0);
});

test("the status control sits in the value column like a value", async ({
  page,
}) => {
  const panel = await openPanel(page, "details");

  // It is a bare <select>, which insets its own text by an amount that is the
  // browser's rather than ours — so its value used to start a few pixels left
  // of every other value in the column.
  const status = await panel.getStatusSelect().boundingBox();
  const membership = await panel.getMembership().boundingBox();
  if (status === null || membership === null) {
    throw new Error("No details on screen");
  }
  expect(Math.abs(Math.round(status.x - membership.x))).toBeLessThanOrEqual(1);
});

test("Details refuses a handle the server would refuse", async ({ page }) => {
  const panel = await openPanel(page, "details");
  await panel.addHandle("WhatsApp", "07700 900123");

  await expect(
    page.getByText("Enter the number with its country code, like +44 7700"),
  ).toBeVisible();
  // Nothing was written, and the form stays open on what you typed.
  await expect(panel.getHandle("whatsapp")).toHaveCount(0);
  await expect(panel.getHandles()).toHaveCount(1);
});

test("a handle is edited and removed on its own row", async ({ page }) => {
  const panel = await openPanel(page, "handles");

  await panel
    .getHandle("instagram")
    .getByRole("button", { name: "Edit" })
    .click();
  await panel.getHandle("instagram").getByLabel("Handle").fill("holly.renamed");
  await panel
    .getHandle("instagram")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(panel.getHandle("instagram")).toContainText("holly.renamed");

  await panel
    .getHandle("instagram")
    .getByRole("button", { name: "Edit" })
    .click();
  await panel
    .getHandle("instagram")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(panel.getHandles()).toHaveCount(0);
});

test("status moves the candidate between the list's filters", async ({
  page,
}) => {
  const panel = await openPanel(page, "status");
  await panel.getStatusSelect().selectOption("archived");

  await expect(panel.getStatusSelect()).toHaveValue("archived");
  await page.reload();
  await expect(panel.getStatusSelect()).toHaveValue("archived");
});

test("History reads the trail, and filters it", async ({ page }) => {
  const panel = await openPanel(page, "history");
  await panel.openSection("History");

  // Newest first: they accepted after the matchmaker onboarded them.
  const entries = panel.getHistoryEntries();
  await expect(entries.first()).toContainText("Accepted the invitation");
  await expect(entries.first()).toContainText("Jane Account ·");
  await expect(entries.last()).toContainText("Onboarded them");
  await expect(entries.last()).toContainText("You ·");

  // A change made now appears at the top, attributed and explained — with the
  // registry's label for the field, not its key.
  await panel.openSection("Profile");
  await panel.addField("heightCm", "178");
  await panel.openSection("History");
  await expect(entries.first()).toContainText("Updated their profile");
  await expect(entries.first()).toContainText("Height (cm): 178");

  await panel.getHistoryFilter("Invitations & membership").click();
  await expect(entries.first()).toContainText("Accepted the invitation");
  // The whole list, not one entry: `not.toContainText` on a multi-element
  // locator is strict.
  await expect(page.getByTestId("candidate-history")).not.toContainText(
    "Updated their profile",
  );

  await panel.getHistoryFilter("Profile").click();
  await expect(entries.first()).toContainText("Updated their profile");
});

test("the panel collapses on a phone and opens on demand", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  const panel = await openPanelOnPhone(page, "details");

  await expect(panel.getRoot()).toBeHidden();
  await panel.getToggle().click();
  await expect(panel.getRoot()).toBeVisible();
  await expect(panel.getNameRow()).toBeVisible();

  // The thread's header is hidden while the panel covers it, so the panel
  // carries its own way out.
  await page.getByTestId("close-candidate-panel").click();
  await expect(panel.getRoot()).toBeHidden();

  // Widen past `lg` and the panel is simply there, with no Details button to
  // open what is already open.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(panel.getRoot()).toBeVisible();
  await expect(panel.getToggle()).toBeHidden();
});

/** Like `openPanel`, but the panel starts collapsed at phone width. */
async function openPanelOnPhone(page: Page, key: string) {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId(key)}`,
  );
  await expect(new ConversationPage(page).getRoot()).toBeVisible();
  return new CandidatePanelPage(page);
}
