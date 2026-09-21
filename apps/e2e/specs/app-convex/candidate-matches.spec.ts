import { expect, type Page, test } from "@playwright/test";
import { CandidatePanelPage } from "../../page-objects/app/candidate-panel.page";
import { ConversationPage } from "../../page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * The Matches section of the candidate panel (prd/phase-3.md §2): the same
 * card the board draws, one at a time, with the stage it is sitting at.
 *
 * The card's own behaviour — the reasons, the menu, responses, rejection — is
 * `matches.spec.ts`, which drives it on the board. What is covered here is
 * what this surface adds: that it is the same card, that it says the stage the
 * board says by column, and that the carousel walks the matches one person is
 * in whichever side of the pair they are on.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [{ key: "maya", name: "Maya Maker" }],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      { key: "sam", matchmakerKey: "book", name: "Sam Member" },
      { key: "jordan", matchmakerKey: "book", name: "Jordan Member" },
      { key: "alex", matchmakerKey: "book", name: "Alex Member" },
      { key: "lonely", matchmakerKey: "book", name: "Lee Lonely" },
    ],
    matches: [
      // Sam is `a` on one and `b` on the other, which is the case a single
      // index would have missed.
      {
        key: "sam-jordan",
        matchmakerKey: "book",
        aKey: "sam",
        bKey: "jordan",
        stage: "suggested",
        score: 82,
      },
      {
        key: "alex-sam",
        matchmakerKey: "book",
        aKey: "alex",
        bKey: "sam",
        stage: "introduced",
        score: 71,
      },
    ],
  });
});

async function openMatches(page: Page, candidate: string) {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId(candidate)}`,
  );
  await expect(new ConversationPage(page).getRoot()).toBeVisible();
  const panel = new CandidatePanelPage(page);
  await expect(panel.getRoot()).toBeVisible();
  await panel.openSection("Matches");
  return panel;
}

test("Matches is the panel's first section", async ({ page }) => {
  const panel = await openMatches(page, "sam");
  const headings = panel.getScroll().getByRole("button");
  await expect(headings.first()).toHaveText("Matches");
});

test("shows the board's own card, plus the stage it is sitting at", async ({
  page,
}) => {
  const panel = await openMatches(page, "jordan");

  // The card itself, not a second smaller rendering of one.
  const card = panel.getMatchCard();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Jordan Member");
  await expect(card).toContainText("Sam Member");
  await expect(card).toHaveAttribute("data-score", "82");

  // The one thing the panel adds: the board says this by which column the
  // card is in, and a panel has no columns to say it with.
  await expect(panel.getMatchStage()).toHaveText("Suggested");
});

test("the carousel walks both sides of the pairs someone is in", async ({
  page,
}) => {
  const panel = await openMatches(page, "sam");

  // Sam is one half of both, and is stored as `a` on one and `b` on the
  // other — the pair is keyed by id order, not by the order it was made in.
  // So the two are asserted as a set: what matters is that neither index
  // misses one, not which comes first.
  await expect(panel.getMatchCounter()).toHaveText("1/2");
  const first = await panel.getMatchCard().textContent();
  const firstStage = await panel.getMatchStage().textContent();

  await panel.nextMatch();
  await expect(panel.getMatchCounter()).toHaveText("2/2");
  const second = await panel.getMatchCard().textContent();
  const secondStage = await panel.getMatchStage().textContent();

  const both = `${first} ${second}`;
  expect(both).toContain("Jordan Member");
  expect(both).toContain("Alex Member");
  expect([firstStage, secondStage].sort()).toEqual(["Introduced", "Suggested"]);

  await panel.previousMatch();
  await expect(panel.getMatchCounter()).toHaveText("1/2");
  await expect(panel.getMatchCard()).toHaveText(first ?? "");
});

test("one match gets no arrows and no counter", async ({ page }) => {
  const panel = await openMatches(page, "jordan");
  await expect(panel.getMatchCard()).toBeVisible();
  await expect(panel.getMatchCounter()).toHaveCount(0);
});

test("somebody with no matches is told so, not shown an empty box", async ({
  page,
}) => {
  const panel = await openMatches(page, "lonely");
  await expect(panel.getMatchCard()).toHaveCount(0);
  await expect(page.getByTestId("no-matches")).toContainText("No matches yet");
});
