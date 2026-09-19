import { expect, test } from "@playwright/test";
import { uniqueEmail } from "../../accounts";
import {
  ConversationPage,
  OnboardPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * Onboarding a candidate (prd/phase-1.md §3.1) and the workspace list around
 * it.
 *
 * One seeded matchmaker per test that writes, so onboarding in one test can't
 * change what another test's list shows.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [{ key: "maya", name: "Maya Maker" }],
    matchmakers: [
      { key: "onboarding", ownerKey: "maya" },
      { key: "duplicates", ownerKey: "maya" },
      { key: "book", ownerKey: "maya" }, // the list: search and filters
    ],
    candidates: [
      {
        key: "existing",
        matchmakerKey: "duplicates",
        name: "Existing Person",
        email: "already.there@matchmaker-e2e.test",
      },
      {
        key: "active",
        matchmakerKey: "book",
        name: "Ada Active",
        membership: "invited",
      },
      {
        key: "paused",
        matchmakerKey: "book",
        name: "Percy Paused",
        status: "paused",
        membership: "declined",
      },
      {
        key: "archived",
        matchmakerKey: "book",
        name: "Archie Archived",
        status: "archived",
        membership: "left",
      },
    ],
  });
});

test.beforeEach(async ({ page }) => {
  await signInAs(page, world.email("maya"));
});

test("onboarding creates the conversation, with the pasted history private", async ({
  page,
}) => {
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("onboarding"));
  await workspace.getOnboardLink().click();

  const onboard = new OnboardPage(page);
  const email = uniqueEmail("onboarded");
  await onboard.addHandle("Instagram", "https://instagram.com/jane.doe/");
  await onboard.addHandle("WhatsApp", "+44 (0)7700 900123");
  await onboard.getEmailInput().fill(`  ${email.toUpperCase()} `);
  await onboard.getNameInput().fill("  Jane   Doe ");
  await onboard
    .getHistoryInput()
    .fill("Jane: Hi! A friend sent me your way.\nMe: Lovely to hear from you.");
  await onboard.getSubmitButton().click();

  const conversation = new ConversationPage(page);
  await expect(page).toHaveURL(/\/app\/mm\/[^/]+\/c\/[^/]+$/);
  await expect(conversation.getCandidateName()).toHaveText("Jane Doe");

  const messages = conversation.getMessages();
  await expect(messages).toHaveCount(1);
  await expect(messages.first()).toContainText("Only visible to you");
  await expect(messages.first()).toContainText(
    "Jane: Hi! A friend sent me your way.\nMe: Lovely to hear from you.",
  );
  await expect(conversation.getMembershipBanner()).toContainText(
    "Invited · not joined yet.",
  );
  await expect(workspace.getCandidateRow("Jane Doe")).toContainText("Invited");
});

test("the form checks the server's rules before sending anything", async ({
  page,
}) => {
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("onboarding"));
  await workspace.getOnboardLink().click();
  const onboard = new OnboardPage(page);

  await onboard.getSubmitButton().click();
  await expect(onboard.getError("Enter their email address.")).toBeVisible();

  await onboard.getEmailInput().fill("not-an-email");
  await onboard.getSubmitButton().click();
  await expect(onboard.getError("Enter a valid email address.")).toBeVisible();

  await onboard.getEmailInput().fill(uniqueEmail("rules"));
  await onboard.addHandle("WhatsApp", "07700 900123");
  await onboard.getSubmitButton().click();
  await expect(
    onboard.getError(/Enter the number with its country code/),
  ).toBeVisible();

  // Still on the form: nothing was created.
  await expect(onboard.getForm()).toBeVisible();
});

test("an email already in the book links to that candidate", async ({
  page,
}) => {
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("duplicates"));
  await workspace.getOnboardLink().click();

  const onboard = new OnboardPage(page);
  await onboard
    .getEmailInput()
    .fill(world.candidates.existing.email.toUpperCase());
  await onboard.getSubmitButton().click();
  await expect(onboard.getDuplicateNotice()).toContainText(
    "You already have a candidate with this email.",
  );

  await onboard.getDuplicateNotice().getByRole("link").click();
  await expect(page).toHaveURL(
    new RegExp(`/c/${world.candidateId("existing")}$`),
  );
  await expect(new ConversationPage(page).getCandidateName()).toHaveText(
    "Existing Person",
  );
});

test("the list filters by status and searches by name and email", async ({
  page,
}) => {
  const workspace = new WorkspacePage(page);
  await workspace.goto(world.username("book"));

  await expect(workspace.getCandidateRow("Ada Active")).toBeVisible();
  await expect(workspace.getCandidateRow("Percy Paused")).toBeHidden();

  await workspace.getStatusFilter("Paused").click();
  await expect(workspace.getCandidateRow("Percy Paused")).toContainText(
    "Declined",
  );
  await workspace.getStatusFilter("Archived").click();
  await expect(workspace.getCandidateRow("Archie Archived")).toContainText(
    "Left",
  );

  await workspace.getStatusFilter("Active").click();
  await workspace.getSearchInput().fill("ada");
  await expect(workspace.getCandidateRow("Ada Active")).toBeVisible();
  await workspace.getSearchInput().fill(world.candidates.active.email);
  await expect(workspace.getCandidateRow("Ada Active")).toBeVisible();
  await workspace.getSearchInput().fill("nobody here");
  await expect(workspace.getCandidates()).toContainText("No matches");
});

test("an unknown or malformed conversation id shows not found", async ({
  page,
}) => {
  const conversation = new ConversationPage(page);
  await page.goto(`/app/mm/${world.username("book")}/c/not-an-id`);
  await expect(conversation.getNotFound()).toBeVisible();

  // A real id from another of this account's books is still not found here.
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("existing")}`,
  );
  await expect(conversation.getNotFound()).toBeVisible();
});
