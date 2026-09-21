import { expect, type Page, test } from "@playwright/test";
import { CandidatePanelPage } from "../../page-objects/app/candidate-panel.page";
import {
  ConversationPage,
  MatchmakerSettingsPage,
} from "../../page-objects/app/matchmaker.page";
import { SuggestionsPage } from "../../page-objects/app/suggestions.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * The suggestion cards above the composer (prd/phase-2.md §5): one row per
 * kind, one card per row, and arrows through the rest.
 *
 * Every proposal here is seeded. An open `pending` is a state an agent
 * produces and no amount of clicking can reach, which is the whole reason the
 * scenario builder can write one.
 *
 * Seeded proposals share a `suggestedAt`, so a row's order is the tie-break on
 * id — `facts.orientation`, `facts.pets`, `facts.wantsKids`, alphabetically.
 * One candidate per test that answers anything, so no test can change what
 * another sees; the voice is the *matchmaker's*, so the test that accepts one
 * gets a matchmaker of its own.
 */

let world: Scenario;

test.beforeAll(async () => {
  const threeSuggestions = {
    facts: { wantsKids: "no", pets: "A cat" },
    suggestions: [
      { kind: "facts" as const, key: "wantsKids", value: "yes" },
      { kind: "facts" as const, key: "orientation", value: "bisexual" },
      // The agent has heard the cat is gone.
      { kind: "facts" as const, key: "pets", value: "", remove: true },
    ],
  };

  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "vic", name: "Vic Voice" },
      // Joined, so the conversation she is read from has an open composer.
      { key: "bea", name: "Bea Browse" },
    ],
    matchmakers: [
      {
        key: "book",
        ownerKey: "maya",
        displayName: "Maya's Book",
        voice: "Warm, short, never salesy.",
        voiceSuggestion: "Warm and short, and never once salesy.",
      },
      {
        key: "solo",
        ownerKey: "vic",
        displayName: "Vic's Book",
        voiceSuggestion: "Direct, curious, and quick to ask a second question.",
      },
    ],
    candidates: [
      {
        key: "browse",
        matchmakerKey: "book",
        userKey: "bea",
        membership: "joined",
        name: "Bea Browse",
        profile: threeSuggestions,
      },
      {
        key: "dismiss",
        matchmakerKey: "book",
        name: "Dee Dismiss",
        profile: threeSuggestions,
      },
      {
        key: "accept",
        matchmakerKey: "book",
        name: "Ada Accept",
        profile: {
          facts: { wantsKids: "no" },
          suggestions: [{ kind: "facts", key: "wantsKids", value: "yes" }],
        },
      },
      { key: "quiet", matchmakerKey: "book", name: "Quinn Quiet" },
      { key: "vicky", matchmakerKey: "solo", name: "Vicky Client" },
    ],
  });
});

/** Opens a conversation and hands back its suggestion stack. */
async function openConversation(
  page: Page,
  matchmaker: "book" | "solo",
  candidate: string,
) {
  await signInAs(page, world.email(matchmaker === "book" ? "maya" : "vic"));
  await page.goto(
    `/app/mm/${world.username(matchmaker)}/c/${world.candidateId(candidate)}`,
  );
  await expect(new ConversationPage(page).getRoot()).toBeVisible();
  return new SuggestionsPage(page);
}

test("one row per kind, above the composer, newest card showing", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "book", "browse");
  const conversation = new ConversationPage(page);

  await expect(suggestions.getRoot()).toBeVisible();
  // Two kinds have something to say: this candidate's profile, and the
  // matchmaker's own voice. The reply and match rows have no source yet.
  await expect(suggestions.getRows()).toHaveCount(2);

  // The stack sits between the thread and the composer.
  await expect(conversation.getComposer()).toBeVisible();
  await expect(suggestions.getRoot()).toBeVisible();

  // Three proposals about the candidate, one card, a counter that says so.
  await expect(suggestions.getCounter("candidateProfile")).toHaveText("1/3");
  await expect(suggestions.getCard("candidateProfile")).toHaveAttribute(
    "data-suggestion-id",
    "candidateProfile:facts.orientation",
  );
  await expect(suggestions.getCard("candidateProfile")).toContainText(
    "Orientation",
  );
  await expect(suggestions.getCard("candidateProfile")).toContainText(
    "bisexual",
  );

  // One proposal about the matchmaker, so no counter and no arrows.
  await expect(suggestions.getCounter("matchmakerProfile")).toHaveCount(0);
  await expect(suggestions.getNewerButton("matchmakerProfile")).toHaveCount(0);
  await expect(suggestions.getCard("matchmakerProfile")).toContainText(
    "Your voice",
  );
});

test("the arrows walk a row and stop at either end", async ({ page }) => {
  const suggestions = await openConversation(page, "book", "browse");

  // At the newest, so there is nothing newer to go to.
  await expect(suggestions.getNewerButton("candidateProfile")).toBeDisabled();

  await suggestions.goOlder("candidateProfile");
  await expect(suggestions.getCounter("candidateProfile")).toHaveText("2/3");
  await expect(suggestions.getCard("candidateProfile")).toHaveAttribute(
    "data-suggestion-id",
    "candidateProfile:facts.pets",
  );
  // A removal says what would go, not just that something would.
  await expect(suggestions.getCard("candidateProfile")).toContainText(
    "Remove this",
  );
  await expect(suggestions.getCard("candidateProfile")).toContainText("A cat");

  await suggestions.goOlder("candidateProfile");
  await expect(suggestions.getCounter("candidateProfile")).toHaveText("3/3");
  await expect(suggestions.getOlderButton("candidateProfile")).toBeDisabled();
  // A change to a recorded value shows what it is now as well as what it
  // would become.
  await expect(suggestions.getCard("candidateProfile")).toContainText("no");
  await expect(suggestions.getCard("candidateProfile")).toContainText("yes");

  await suggestions.goNewer("candidateProfile");
  await expect(suggestions.getCounter("candidateProfile")).toHaveText("2/3");
});

test("dismissing answers only the card showing", async ({ page }) => {
  const suggestions = await openConversation(page, "book", "dismiss");

  await expect(suggestions.getCounter("candidateProfile")).toHaveText("1/3");
  await suggestions.dismiss("candidateProfile");

  // The one behind it takes its place, and the other two are still waiting.
  await expect(suggestions.getCounter("candidateProfile")).toHaveText("1/2");
  await expect(suggestions.getCard("candidateProfile")).toHaveAttribute(
    "data-suggestion-id",
    "candidateProfile:facts.pets",
  );

  // Dismissed for good, not merely skipped: still gone after a reload.
  await page.reload();
  await expect(suggestions.getCounter("candidateProfile")).toHaveText("1/2");
  await expect(suggestions.getCard("candidateProfile")).toHaveAttribute(
    "data-suggestion-id",
    "candidateProfile:facts.pets",
  );
});

test("accepting a change puts it on the profile", async ({ page }) => {
  const suggestions = await openConversation(page, "book", "accept");

  await expect(suggestions.getCard("candidateProfile")).toContainText(
    "Wants children",
  );
  await suggestions.accept("candidateProfile");

  // The row was the only one about this candidate, so it goes entirely.
  await expect(suggestions.getRow("candidateProfile")).toHaveCount(0);

  const panel = new CandidatePanelPage(page);
  await panel.openSection("Profile");
  await expect(panel.getField("wantsKids")).toContainText("yes");
});

test("the drafted voice is answered from the conversation", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "solo", "vicky");

  await expect(suggestions.getRows()).toHaveCount(1);
  await expect(suggestions.getCard("matchmakerProfile")).toContainText(
    "Direct, curious",
  );

  await suggestions.accept("matchmakerProfile");
  await expect(suggestions.getRoot()).toHaveCount(0);

  // It is theirs now, wherever they look at it.
  const settings = new MatchmakerSettingsPage(page);
  await settings.goto(world.username("solo"));
  await expect(settings.getVoiceInput()).toHaveValue(
    "Direct, curious, and quick to ask a second question.",
  );
  await expect(settings.getVoiceSuggestion()).toHaveCount(0);
});

test("a candidate with nothing pending gets no stack at all", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "book", "quiet");

  // The matchmaker's voice draft is still open, so the stack is here — but
  // this candidate contributes no row to it.
  await expect(suggestions.getRow("candidateProfile")).toHaveCount(0);
  await expect(suggestions.getRow("matchmakerProfile")).toHaveCount(1);
});
