import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { MatchesPage } from "@repo/harness/page-objects/app/matches.page";
import { SCRATCH_DIR } from "@repo/harness/paths";
import type { Scenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";
import { Director } from "../../lib/director";
import { seedScene } from "../../lib/scene";

/**
 * What the whole product is for: the book, read as pairs.
 *
 * The run on camera is **real**. `Find matches` is the deterministic scorer in
 * `matches/rules.ts` going over every pair in the book, and the cards that land
 * are the ones it actually found — the only demo here where the thing being
 * photographed is computed during the take rather than seeded. It can be real
 * precisely because it is arithmetic and not a model: no gateway, no key, and
 * the local anonymous backend runs it exactly as production does.
 *
 * Each card carries its score *and its reasons*, which is the argument against
 * a black box. A matchmaker does not need to be told two people match; she
 * needs to see why, and disagree.
 *
 * **Not a test.** It asserts nothing about the app; it photographs it. The
 * coverage lives in `tooling/e2e/specs/app-convex/matches.spec.ts`, including
 * the one that asserts what a run finds.
 *
 *   pnpm --filter marketing exec playwright test captures/demos/match-board.spec.ts
 *   pnpm render:demo -- --name match-board
 */
const NAME = "match-board";
const OUT = join(SCRATCH_DIR, "marketing", "demos", NAME);

const VIEWPORT = { width: 1440, height: 810 };
const SCALE = 2;

test.use({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: "light",
});

test.setTimeout(5 * 60_000);

/**
 * Everything every profile here fills in, so each pair clears the scorer's
 * coverage bar and the cards carry a score rather than a "needs more profile".
 */
const COMMON = {
  locationCity: "Toronto",
  locationCountry: "Canada",
  languages: "English",
};

/**
 * The book — and **the differences are the point**.
 *
 * A first cut gave all six the same answers to everything. The run duly found
 * eight pairs and scored every one of them 100, which is the least convincing
 * board imaginable: a scorer that returns a constant is indistinguishable from
 * one that isn't reading. So these six disagree the way six real people do —
 * about children, drink, observance, how far along they want to be — and the
 * run has to rank them. Sam and Mei agree on nearly everything and come out
 * top; Jonas wants no children in a book where almost everyone does, and his
 * cards sit low.
 *
 * Everyone has joined: a card about somebody who never accepted an invitation
 * is a state the product cannot reach.
 */
const BOOK = [
  {
    key: "sam",
    name: "Sam Okonkwo",
    facts: {
      ...COMMON,
      age: "34",
      gender: "man",
      seekingGender: "women",
      partnerAgeRange: "28-38",
      lookingFor: "marriage",
      wantsKids: "yes",
      smoking: "never",
      drinking: "socially",
      exercise: "often",
      diet: "omnivore",
      education: "postgraduate",
      religionImportance: "low",
      familyImportance: "high",
    },
  },
  {
    key: "mei",
    name: "Mei Chen",
    facts: {
      ...COMMON,
      age: "35",
      gender: "woman",
      seekingGender: "men",
      partnerAgeRange: "32-42",
      lookingFor: "marriage",
      wantsKids: "yes",
      smoking: "never",
      drinking: "socially",
      exercise: "often",
      diet: "omnivore",
      education: "postgraduate",
      religionImportance: "low",
      familyImportance: "high",
    },
  },
  {
    key: "priya",
    name: "Priya Raman",
    facts: {
      ...COMMON,
      age: "31",
      gender: "woman",
      seekingGender: "men",
      partnerAgeRange: "30-40",
      lookingFor: "marriage",
      wantsKids: "yes",
      smoking: "never",
      drinking: "never",
      exercise: "often",
      diet: "vegetarian",
      education: "postgraduate",
      religionImportance: "medium",
      familyImportance: "high",
    },
  },
  {
    key: "nadia",
    name: "Nadia Haddad",
    facts: {
      ...COMMON,
      age: "33",
      gender: "woman",
      seekingGender: "men",
      partnerAgeRange: "32-42",
      lookingFor: "marriage",
      wantsKids: "yes",
      smoking: "never",
      drinking: "never",
      exercise: "often",
      diet: "halal",
      education: "postgraduate",
      religionImportance: "high",
      familyImportance: "high",
    },
  },
  {
    key: "tom",
    name: "Tom Alvarez",
    facts: {
      ...COMMON,
      age: "36",
      gender: "man",
      seekingGender: "women",
      partnerAgeRange: "30-42",
      lookingFor: "long-term",
      wantsKids: "maybe",
      smoking: "socially",
      drinking: "regularly",
      exercise: "sometimes",
      diet: "omnivore",
      education: "undergraduate",
      religionImportance: "low",
      familyImportance: "medium",
    },
  },
  {
    key: "jonas",
    name: "Jonas Berg",
    facts: {
      ...COMMON,
      age: "38",
      gender: "man",
      seekingGender: "women",
      partnerAgeRange: "32-44",
      lookingFor: "marriage",
      wantsKids: "no",
      smoking: "never",
      drinking: "socially",
      exercise: "daily",
      diet: "omnivore",
      education: "doctorate",
      religionImportance: "low",
      familyImportance: "medium",
    },
  },
];

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScene({
    users: [
      { key: "maya", name: "Maya Maker", email: "maya@makerandco.example.com" },
      ...BOOK.map((p) => ({
        key: `u${p.key}`,
        name: p.name,
        email: `${p.key}@example.com`,
      })),
    ],
    matchmakers: [
      {
        key: "book",
        ownerKey: "maya",
        displayName: "Maya Maker",
        businessName: "Maker & Co.",
      },
    ],
    // No `matches`: the board opens empty on purpose, so the cards that appear
    // are the ones the run finds on camera.
    candidates: BOOK.map((p) => ({
      key: p.key,
      matchmakerKey: "book",
      userKey: `u${p.key}`,
      name: p.name,
      membership: "joined" as const,
      profile: { facts: p.facts },
    })),
  });
});

test("the board finds its own pairs, and explains them", async ({ page }) => {
  const director = new Director(page, {
    name: NAME,
    outDir: OUT,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
  });

  await page.addInitScript(() => {
    localStorage.setItem("matchmaker-theme", "light");
    localStorage.setItem("matchmaker-push-nudge-dismissed", "1");
  });
  await director.start();

  await signInAs(page, world.email("maya"));

  const board = new MatchesPage(page);

  // ── 1. An empty board over a full book ────────────────────────────────────
  await board.goto(world.username("book"));
  await board.getRoot().waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
  await director.hold(2200, "six people, no pairs yet");

  // ── 2. The run — real, and on camera ──────────────────────────────────────
  await director.click(page.getByTestId("find-matches"), {
    // Held long: the summary line and the cards land together, and the summary
    // is what tells the viewer this was computed rather than retrieved.
    settleMs: 400,
    label: "find matches",
  });
  await board.getRunSummary().waitFor({ state: "visible" });
  await expect(board.getCards().first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await director.hideCursor();
  await director.hold(4000, "what the run found");
  await director.showCursor();

  // ── 3. Why, not just who ──────────────────────────────────────────────────
  // The top card, whichever pair the scorer ranked first — picked by position
  // rather than by name so the clip survives a retune of the weights.
  const top = board.getCards().first();
  await expect(board.getScore(top)).toBeVisible();
  await director.click(board.getExpand(top), {
    settleMs: 4200,
    label: "and why",
  });

  // ── 4. Her call, not its call ─────────────────────────────────────────────
  // The card moves because she moved it. Nothing on this board advances on its
  // own — the run proposes, and every stage after `proposed` is a person's.
  await director.click(top.getByTestId("match-card-menu"), {
    settleMs: 600,
    label: "she decides",
  });
  await director.click(page.getByTestId("match-move-introduced"), {
    settleMs: 3400,
    label: "introduced",
  });

  const manifest = director.finish();
  console.log(
    `\n  ${NAME}: ${(director.durationMs / 1000).toFixed(2)}s across ` +
      `${manifest.timeline.length} beats → ${OUT}\n` +
      `  Render it:  pnpm render:demo -- --name ${NAME}\n`,
  );
});
