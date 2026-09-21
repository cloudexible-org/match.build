import { expect, type Page, test } from "@playwright/test";
import { CandidatePanelPage } from "../../page-objects/app/candidate-panel.page";
import { ConversationPage } from "../../page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

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

  await expect(panel.getNameInput()).toHaveValue("Dana Details");
  await expect(panel.getEmail()).toHaveText(world.candidates.details.email);
  await expect(panel.getMembership()).toHaveText("Invited");

  await panel.getNameInput().fill("Dana Renamed");
  await panel.getSaveDetailsButton().click();
  await expect(panel.getDetailsStatus()).toHaveText("Saved.");

  // The rest of the workspace follows.
  await expect(new ConversationPage(page).getCandidateName()).toHaveText(
    "Dana Renamed",
  );
  await page.reload();
  await expect(panel.getNameInput()).toHaveValue("Dana Renamed");
});

test("Details refuses a handle the server would refuse", async ({ page }) => {
  const panel = await openPanel(page, "details");
  await page.getByRole("button", { name: "Add a handle" }).click();
  const row = page.getByTestId("details-handle").last();
  await row.getByRole("combobox").selectOption({ label: "WhatsApp" });
  await row.getByRole("textbox").fill("07700 900123");
  await panel.getSaveDetailsButton().click();

  await expect(
    page.getByText("Enter the number with its country code, like +44 7700"),
  ).toBeVisible();
  await expect(panel.getDetailsStatus()).toHaveText("");
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
  await expect(panel.getNameInput()).toBeVisible();

  // The thread's header is hidden while the panel covers it, so the panel
  // carries its own way out.
  await page.getByTestId("close-candidate-panel").click();
  await expect(panel.getRoot()).toBeHidden();
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
