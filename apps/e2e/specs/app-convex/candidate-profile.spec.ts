import { expect, type Page, test } from "@playwright/test";
import { CandidatePanelPage } from "../../page-objects/app/candidate-panel.page";
import { ConversationPage } from "../../page-objects/app/matchmaker.page";
import { SuggestionsPage } from "../../page-objects/app/suggestions.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * The Profile section of the candidate panel (prd/phase-2.md §3, §5): the
 * structured facts from the registry and the free-text notes.
 *
 * An agent's proposal is answered in the stack above the composer, not here,
 * so the last test drives that and asserts what it does to the record. The
 * stack's own behaviour — rows, arrows, counters — is
 * `chat-suggestions.spec.ts`.
 *
 * One seeded candidate per test that writes, so an edit in one test can't
 * change what another sees.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [{ key: "maya", name: "Maya Maker" }],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      { key: "facts", matchmakerKey: "book", name: "Fay Facts" },
      { key: "notes", matchmakerKey: "book", name: "Nina Notes" },
      {
        key: "suggested",
        matchmakerKey: "book",
        name: "Sue Suggested",
        // A proposal nobody has answered: the state an agent produces, which
        // no amount of clicking could reach.
        profile: {
          facts: { wantsKids: "no", pets: "A cat" },
          suggestions: [
            { kind: "facts", key: "wantsKids", value: "yes" },
            { kind: "facts", key: "orientation", value: "bisexual" },
            // The agent has heard the cat is gone.
            { kind: "facts", key: "pets", value: "", remove: true },
          ],
        },
      },
    ],
  });
});

/** Opens a candidate's conversation with the Profile section showing. */
async function openProfile(page: Page, key: string) {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId(key)}`,
  );
  await expect(new ConversationPage(page).getRoot()).toBeVisible();
  const panel = new CandidatePanelPage(page);
  await expect(panel.getRoot()).toBeVisible();
  await panel.openSection("Profile");
  return panel;
}

test("a fact is added, edited and cleared", async ({ page }) => {
  const panel = await openProfile(page, "facts");

  // The panel renders what is filled in, not the whole registry.
  await expect(panel.getFields()).toHaveCount(0);
  await expect(panel.getProfile()).toContainText("Nothing recorded yet.");

  await panel.addField("wantsKids", "yes");
  await expect(panel.getField("wantsKids")).toContainText("yes");
  await expect(panel.getField("wantsKids")).toContainText("You added this");

  await panel.editField("wantsKids", "maybe");
  await expect(panel.getField("wantsKids")).toContainText("maybe");

  // It survives a reload, and the grouping is the registry's.
  await page.reload();
  await panel.openSection("Profile");
  await expect(panel.getProfile()).toContainText("Family");
  await expect(panel.getField("wantsKids")).toContainText("maybe");

  await panel.clearField("wantsKids");
  await expect(panel.getFields()).toHaveCount(0);
});

test("a value the registry refuses never reaches the row", async ({ page }) => {
  const panel = await openProfile(page, "facts");

  await page.getByTestId("profile-add-field").selectOption("partnerAgeRange");
  await panel.getAddFieldValue().fill("36-28");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByText("Partner age range starts with the lower number."),
  ).toBeVisible();
  await expect(panel.getField("partnerAgeRange")).toHaveCount(0);
});

test("a note is added, edited and removed", async ({ page }) => {
  const panel = await openProfile(page, "notes");

  await panel.addNote("idealWeekend", "Prefers mornings.");
  await expect(panel.getNotes()).toHaveCount(1);
  await expect(panel.getNote("idealWeekend")).toContainText(
    "Prefers mornings.",
  );
  await expect(panel.getNote("idealWeekend")).toContainText("Ideal weekend");

  await panel.editNote("idealWeekend", "Prefers mornings and hiking.");
  await expect(panel.getNote("idealWeekend")).toContainText(
    "Prefers mornings and hiking.",
  );

  await panel.removeNote("idealWeekend");
  await expect(panel.getNotes()).toHaveCount(0);
  await expect(page.getByText("No notes yet.")).toBeVisible();
});

test("an empty note is refused", async ({ page }) => {
  await openProfile(page, "notes");
  await page.getByTestId("profile-add-note-key").selectOption("hobbies");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Write something first.")).toBeVisible();
});

test("a proposal changes nothing until the stack answers it", async ({
  page,
}) => {
  const panel = await openProfile(page, "suggested");
  const suggestions = new SuggestionsPage(page);

  // Three proposals, all in the one row, oldest-to-newest ties broken on key:
  // orientation, pets, wantsKids.
  await expect(suggestions.getCounter("candidateProfile")).toHaveText("1/3");
  // The record itself hasn't moved.
  await expect(panel.getField("wantsKids")).toContainText("no");
  await expect(panel.getField("orientation")).toHaveCount(0);

  // Dismissing leaves nothing behind: nothing was there before it.
  await suggestions.dismiss("candidateProfile");
  await expect(panel.getField("orientation")).toHaveCount(0);
  await expect(suggestions.getCounter("candidateProfile")).toHaveText("1/2");

  // A proposal can be that the entry go, and it reads as one.
  const removal = suggestions.getCard("candidateProfile");
  await expect(removal).toContainText("Remove this");
  await expect(removal).toContainText("A cat");
  await suggestions.accept("candidateProfile");
  await expect(panel.getField("pets")).toHaveCount(0);

  // The last one, and approving it says who wrote the value and who agreed.
  await expect(suggestions.getCounter("candidateProfile")).toHaveCount(0);
  await suggestions.accept("candidateProfile");
  await expect(suggestions.getRow("candidateProfile")).toHaveCount(0);
  await expect(panel.getField("wantsKids")).toContainText("yes");
  await expect(panel.getField("wantsKids")).toContainText(
    "Suggested by the assistant, approved by you",
  );
});
