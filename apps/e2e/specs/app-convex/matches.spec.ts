import { expect, type Page, test } from "@playwright/test";
import { MatchesPage } from "../../page-objects/app/matches.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * The match board (prd/phase-3.md §2): the cards the deterministic algorithm
 * produces, and what a matchmaker can do with them.
 *
 * Two kinds of test here. The ones that *move* cards work on seeded cards, one
 * per test, so a move in one can't change what another sees. The one that runs
 * the algorithm works on a book seeded with profiles and no cards, and asserts
 * what the run found — that pair is scored by `matches/rules.ts`, which has its
 * own unit tests, so this asserts that a card appeared and explains itself
 * rather than asserting a number.
 */

/** Enough of a profile for a pair to clear the coverage bar. */
const MAN = {
  age: "34",
  gender: "man",
  seekingGender: "women",
  partnerAgeRange: "28-40",
  locationCity: "Toronto",
  locationCountry: "Canada",
  lookingFor: "marriage",
  wantsKids: "yes",
  smoking: "never",
  drinking: "socially",
  languages: "English",
  exercise: "often",
  diet: "omnivore",
  education: "postgraduate",
  religionImportance: "low",
  familyImportance: "high",
};

const WOMAN = {
  ...MAN,
  age: "31",
  gender: "woman",
  seekingGender: "men",
  partnerAgeRange: "30-42",
};

/** Nobody in this book is looking for him, so no filter lets him through. */
const UNMATCHABLE = { ...MAN, age: "60", seekingGender: "men" };

const SIGNALS = [
  { key: "lookingFor", weight: 6, earned: 1, detail: "Both want marriage" },
  { key: "location", weight: 6, earned: 1, detail: "Both in Toronto" },
  { key: "smoking", weight: 4, earned: 0, detail: "never and regularly" },
];

/**
 * The book. Everyone here has joined — a card about somebody who never
 * accepted an invitation is a state the product can't reach, and a board
 * seeded into one would prove nothing.
 */
const BOOK: { key: string; name: string; facts?: Record<string, string> }[] = [
  // The pair the run should find, plus the man no filter lets through.
  { key: "sam", name: "Sam Seeker", facts: MAN },
  { key: "joan", name: "Joan Jones", facts: WOMAN },
  { key: "theo", name: "Theo Theo", facts: UNMATCHABLE },
  // A pair per test that moves a card, so two moves can't collide.
  { key: "mova", name: "Mova One" },
  { key: "movb", name: "Movb Two" },
  { key: "reja", name: "Reja One" },
  { key: "rejb", name: "Rejb Two" },
  { key: "inta", name: "Inta One" },
  { key: "intb", name: "Intb Two" },
  { key: "olda", name: "Olda One" },
  { key: "oldb", name: "Oldb Two" },
  { key: "backa", name: "Backa One" },
  { key: "backb", name: "Backb Two" },
  // Hand-pairing.
  { key: "handa", name: "Handa One" },
  { key: "handb", name: "Handb Two" },
];

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      ...BOOK.map((person) => ({ key: `u${person.key}` })),
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: BOOK.map((person) => ({
      key: person.key,
      matchmakerKey: "book",
      userKey: `u${person.key}`,
      name: person.name,
      membership: "joined" as const,
      profile: person.facts === undefined ? undefined : { facts: person.facts },
    })),
    matches: [
      {
        key: "moving",
        matchmakerKey: "book",
        aKey: "mova",
        bKey: "movb",
        score: 82,
        coverage: 0.72,
        signals: SIGNALS,
      },
      {
        key: "rejecting",
        matchmakerKey: "book",
        aKey: "reja",
        bKey: "rejb",
        score: 71,
        coverage: 0.6,
      },
      {
        key: "introduced",
        matchmakerKey: "book",
        aKey: "inta",
        bKey: "intb",
        stage: "introduced",
        candidateAResponse: "pending",
        candidateBResponse: "pending",
        score: 77,
        coverage: 0.6,
      },
      {
        key: "aged",
        matchmakerKey: "book",
        aKey: "olda",
        bKey: "oldb",
        stage: "rejected",
        rejectedBy: "matchmaker",
        rejectionReason: "Ancient history.",
        stageChangedDaysAgo: 60,
      },
      {
        key: "back",
        matchmakerKey: "book",
        aKey: "backa",
        bKey: "backb",
        stage: "rejected",
        rejectedBy: "candidateA",
        rejectionReason: "Bad timing.",
      },
    ],
  });
});

async function openBoard(page: Page) {
  await signInAs(page, world.email("maya"));
  const board = new MatchesPage(page);
  await board.goto(world.username("book"));
  await expect(board.getRoot()).toBeVisible();
  return board;
}

test("the board is five columns and a lane, reachable from the workspace", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  await page.goto(`/app/mm/${world.username("book")}`);
  await page.getByTestId("workspace-matches").click();

  const board = new MatchesPage(page);
  await expect(board.getRoot()).toBeVisible();
  await expect(page.getByTestId("match-column")).toHaveCount(5);
  await expect(board.getColumn("suggested")).toBeVisible();
  await expect(board.getColumn("connected")).toBeVisible();
  // Rejected is a lane under the board, not a sixth column.
  await expect(board.getLane()).toBeVisible();
});

test("a card says who, how well, and why", async ({ page }) => {
  const board = await openBoard(page);
  const card = board.getCard("Mova One", "Movb Two");

  await expect(card).toBeVisible();
  await expect(board.getScore(card)).toContainText("82");
  // The score reads with what it was based on, never on its own.
  await expect(board.getScore(card)).toContainText("profile");
  await expect(board.getReasons(card)).toHaveCount(3);
  await expect(card).toContainText("Both want marriage");
  // Including the one that doesn't work, which is the point of the card.
  await expect(
    board.getReasons(card).filter({ hasText: "never and regularly" }),
  ).toHaveAttribute("data-agrees", "false");
});

test("a card moves between columns, and the move sticks", async ({ page }) => {
  const board = await openBoard(page);
  const card = board.getCard("Mova One", "Movb Two");
  await expect(card).toHaveAttribute("data-stage", "suggested");

  await board.move(card, "reviewing");
  await expect(board.getCard("Mova One", "Movb Two")).toHaveAttribute(
    "data-stage",
    "reviewing",
  );
  await expect(board.getColumn("reviewing")).toContainText("Mova One");

  await page.reload();
  await expect(board.getCard("Mova One", "Movb Two")).toHaveAttribute(
    "data-stage",
    "reviewing",
  );
});

test("turning a card down records who and why", async ({ page }) => {
  const board = await openBoard(page);
  const card = board.getCard("Reja One", "Rejb Two");

  // The reason is the taste signal: the form refuses to submit without one.
  await board.openRejectForm(card);
  await card.getByTestId("reject-submit").click();
  await expect(card.getByTestId("reject-error")).toBeVisible();

  // Picked by name: which of the two the table calls "A" is down to how their
  // ids sort, and the person turning a match down is a person, not a slot.
  await board.getRejectBy(card, "Rejb Two").click();
  await card.getByTestId("reject-reason").fill("She's moving to Berlin.");
  await card.getByTestId("reject-submit").click();

  const rejected = board.getCard("Reja One", "Rejb Two");
  await expect(rejected).toHaveAttribute("data-stage", "rejected");
  await expect(board.getLane()).toContainText("She's moving to Berlin.");
  await expect(board.getRejection(rejected)).toContainText("Rejb Two");
});

test("a card comes back onto the board without its rejection", async ({
  page,
}) => {
  const board = await openBoard(page);
  const card = board.getCard("Backa One", "Backb Two");
  await expect(board.getRejection(card)).toContainText("Bad timing.");

  await board.move(card, "reviewing");
  const moved = board.getCard("Backa One", "Backb Two");
  await expect(moved).toHaveAttribute("data-stage", "reviewing");
  await expect(board.getRejection(moved)).toHaveCount(0);
});

test("two yeses are what moves a card to mutual interest", async ({ page }) => {
  const board = await openBoard(page);
  const card = board.getCard("Inta One", "Intb Two");
  await expect(card).toHaveAttribute("data-stage", "introduced");

  await board.respond(card, "a", "yes");
  await expect(board.getCard("Inta One", "Intb Two")).toHaveAttribute(
    "data-stage",
    "introduced",
  );

  await board.respond(board.getCard("Inta One", "Intb Two"), "b", "yes");
  await expect(board.getCard("Inta One", "Intb Two")).toHaveAttribute(
    "data-stage",
    "mutual_interest",
  );
  await expect(board.getColumn("mutual_interest")).toContainText("Inta One");
});

test("a rejection ages out of the board, but only out of the board", async ({
  page,
}) => {
  const board = await openBoard(page);
  // Two months old: off the lane, while the reason it was turned down stays in
  // the record for good.
  await expect(board.getCardById(world.matchId("aged"))).toHaveCount(0);
  await expect(board.getCards().filter({ hasText: "Olda One" })).toHaveCount(0);
  // A rejection from today is still there.
  await expect(board.getCardById(world.matchId("back"))).toBeVisible();
});

test("two people can be paired by hand", async ({ page }) => {
  const board = await openBoard(page);
  await board.pair("Handa One", "Handb Two");

  const card = board.getCard("Handa One", "Handb Two");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-stage", "suggested");
  // Marked as the matchmaker's own, not the run's.
  await expect(card.getByTestId("match-card-manual")).toBeVisible();

  // And the same pair can't be put on the board twice.
  await board.pair("Handa One", "Handb Two");
  await expect(board.getPairError()).toContainText("already on the board");
});

test("Find matches runs the algorithm and says what it looked at", async ({
  page,
}) => {
  const board = await openBoard(page);
  await board.findMatches();

  await expect(board.getRunSummary()).toContainText("Looked at");
  const found = board.getCard("Sam Seeker", "Joan Jones");
  await expect(found).toBeVisible();
  await expect(board.getScore(found)).toBeVisible();
  await expect(board.getReasons(found).first()).toBeVisible();

  // Theo is in the book with a full profile and passes nobody's filters, so
  // he is on no card at all.
  await expect(board.getCards().filter({ hasText: "Theo Theo" })).toHaveCount(
    0,
  );

  // Running it again finds nothing new: the pair already has a card.
  await board.findMatches();
  await expect(board.getRunSummary()).toContainText("nothing new to suggest");
  await expect(board.getCard("Sam Seeker", "Joan Jones")).toHaveCount(1);
});
