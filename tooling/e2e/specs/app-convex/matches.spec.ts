import { expect, type Page, test } from "@playwright/test";
import { MatchesPage } from "@repo/harness/page-objects/app/matches.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";

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

/** More than a card shows at once, so it has an "All N reasons" to open. */
const MANY_SIGNALS = [
  { key: "lookingFor", weight: 6, earned: 1, detail: "Both want marriage" },
  { key: "location", weight: 6, earned: 1, detail: "Both in Toronto" },
  { key: "wantsKids", weight: 6, earned: 1, detail: "Both want children" },
  { key: "age", weight: 3, earned: 0.8, detail: "31 and 34" },
  { key: "smoking", weight: 4, earned: 0, detail: "never and regularly" },
];

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
  { key: "wona", name: "Wona One" },
  { key: "wonb", name: "Wonb Two" },
  { key: "backa", name: "Backa One" },
  { key: "backb", name: "Backb Two" },
  { key: "newa", name: "Newa One" },
  { key: "newb", name: "Newb Two" },
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
        score: 77,
        coverage: 0.6,
      },
      {
        key: "won",
        matchmakerKey: "book",
        aKey: "wona",
        bKey: "wonb",
        stage: "connected",
        score: 84,
        coverage: 0.7,
      },
      // Nothing else in the file touches this one, so it is still new when
      // the test that cares about that runs.
      {
        key: "fresh",
        matchmakerKey: "book",
        aKey: "newa",
        bKey: "newb",
        score: 68,
        coverage: 0.5,
        signals: MANY_SIGNALS,
      },
      {
        key: "closed",
        matchmakerKey: "book",
        aKey: "backa",
        bKey: "backb",
        stage: "closed",
        closedAs: "didnt_work",
        closedBy: "candidateA",
        closingNote: "Bad timing.",
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

test("the board is three columns, reachable from the workspace", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  await page.goto(`/app/mm/${world.username("book")}`);
  await page.getByTestId("workspace-matches").click();

  const board = new MatchesPage(page);
  await expect(board.getRoot()).toBeVisible();
  // Three, each of them something that happened between two people.
  await expect(page.getByTestId("match-column")).toHaveCount(3);
  await expect(board.getColumn("proposed")).toBeVisible();
  await expect(board.getColumn("connected")).toBeVisible();

  // What is over is off the board, behind a line that counts it.
  await expect(board.getColumn("proposed")).not.toContainText("Backa One");
  await expect(board.getClosedToggle()).toContainText("closed");
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
  await expect(card).toHaveAttribute("data-stage", "proposed");

  await board.move(card, "introduced");
  await expect(board.getCard("Mova One", "Movb Two")).toHaveAttribute(
    "data-stage",
    "introduced",
  );
  await expect(board.getColumn("introduced")).toContainText("Mova One");

  await page.reload();
  await expect(board.getCard("Mova One", "Movb Two")).toHaveAttribute(
    "data-stage",
    "introduced",
  );
});

test("closing a match that didn't work records who ended it and why", async ({
  page,
}) => {
  const board = await openBoard(page);
  const card = board.getCard("Reja One", "Rejb Two");

  // The reason is the taste signal: the form refuses to submit without one.
  await board.openCloseForm(card);
  await card.getByTestId("close-as-didnt_work").click();
  await card.getByTestId("close-submit").click();
  await expect(card.getByTestId("close-error")).toBeVisible();

  // Picked by name: which of the two the table calls "A" is down to how their
  // ids sort, and the person who ended it is a person, not a slot.
  await board.getClosedBy(card, "Rejb Two").click();
  await card.getByTestId("close-note").fill("She's moving to Berlin.");
  await card.getByTestId("close-submit").click();

  // Off the board's columns, and into the line underneath.
  await expect(board.getColumn("proposed")).not.toContainText("Reja One");
  await board.openClosed();
  const closed = board.getCard("Reja One", "Rejb Two");
  await expect(closed).toHaveAttribute("data-stage", "closed");
  await expect(board.getClosingLine(closed)).toContainText("Rejb Two");
  await expect(board.getClosingLine(closed)).toContainText("Berlin");
});

test("closing a match that worked can take both of them out of the book", async ({
  page,
}) => {
  const board = await openBoard(page);
  const card = board.getCard("Wona One", "Wonb Two");
  await expect(card).toHaveAttribute("data-stage", "connected");

  // No reason required for good news, and nobody "ended" it.
  await board.close(card, "together", { note: "Engaged in May." });

  await board.openClosed();
  const closed = board.getCard("Wona One", "Wonb Two");
  await expect(board.getOutcomeBadge(closed)).toContainText("Together");
  await expect(board.getClosedToggle()).toContainText("1 together");

  // Both archived by the checkbox, so neither is offered for a new match —
  // which is the same rule the picker and the nightly run already use.
  await board.openPairForm();
  await expect(page.getByTestId("new-match-a")).not.toContainText("Wona One");
  await expect(page.getByTestId("new-match-a")).not.toContainText("Wonb Two");
});

test("a card comes back onto the board without what closing recorded", async ({
  page,
}) => {
  const board = await openBoard(page);
  await board.openClosed();
  const card = board.getCard("Backa One", "Backb Two");
  await expect(board.getClosingLine(card)).toContainText("Bad timing.");

  await board.move(card, "introduced");
  const moved = board.getCard("Backa One", "Backb Two");
  await expect(moved).toHaveAttribute("data-stage", "introduced");
  await expect(board.getClosingLine(moved)).toHaveCount(0);
});

test("a card is new until you say you have seen it", async ({ page }) => {
  const board = await openBoard(page);
  const card = board.getCard("Newa One", "Newb Two");
  await expect(board.getNewDot(card)).toBeVisible();

  // Reading the card does *not* mark it: unseen cards sort first, so marking
  // on read would reorder a card out from under whoever is reading it.
  await board.getExpand(card).click();
  await expect(board.getNewDot(card)).toBeVisible();

  await board.markSeen(card);
  await expect(board.getNewDot(card)).toHaveCount(0);
  await expect(board.getMarkSeen(card)).toHaveCount(0);

  await page.reload();
  await expect(
    board.getNewDot(board.getCard("Newa One", "Newb Two")),
  ).toHaveCount(0);
});

test("two people can be paired by hand", async ({ page }) => {
  const board = await openBoard(page);
  await board.pair("Handa One", "Handb Two");

  const card = board.getCard("Handa One", "Handb Two");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-stage", "proposed");
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

test("the board fills the frame, and never scrolls past it", async ({
  page,
}) => {
  const board = await openBoard(page);
  await expect(board.getCards().first()).toBeVisible();
  await board.openClosed();

  for (const height of [900, 700, 600, 460]) {
    await page.setViewportSize({ width: 1400, height });
    // A page scrollbar on a board is a page scrollbar into nothing: the
    // columns have already given up their slack, so there is nothing under
    // the bottom of the board to find.
    expect(await board.frameOverflow(), `frame at ${height}px tall`).toBe(0);
    // And the document itself must not scroll either. The workspace is a
    // `h-dvh` shell, so it can only happen when something inside is
    // absolutely positioned without a positioned ancestor — nothing clips
    // such an element, and a column of cards then stretches the whole page.
    expect(await board.pageScroll(), `page at ${height}px tall`).toBe(0);
  }

  // The height goes somewhere: a column out of room scrolls its own cards.
  const column = board.getColumn("proposed");
  const scrolls = await column.evaluate((el) => {
    const list = el.lastElementChild;
    return list !== null && list.scrollHeight > list.clientHeight;
  });
  expect(scrolls).toBe(true);
});
