import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  CandidateChatPage,
  CandidateShellPage,
} from "@repo/harness/page-objects/app/candidate.page";
import { CandidatePanelPage } from "@repo/harness/page-objects/app/candidate-panel.page";
import {
  ConversationPage,
  WorkspacePage,
} from "@repo/harness/page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";

/**
 * The chat shell (`shell/chat-shell.tsx`, `shell/conversation-panes.tsx`):
 * the window itself never scrolls, each of the three columns scrolls inside
 * itself, the composer stays on the bottom of the middle one however long the
 * thread gets, and the three columns' first rule is one line across the
 * window.
 *
 * Read-only — every test here only looks — so the whole file shares one
 * seeded world, long enough in every column to have something to scroll.
 */

const LONG_THREAD = Array.from({ length: 60 }, (_, index) => ({
  author: index % 2 === 0 ? ("matchmaker" as const) : ("candidate" as const),
  body: `Message ${index + 1} in a thread long enough to scroll.`,
}));

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "jane", name: "Jane Member" },
      // A matchmaker each, so the candidate's first column has more rows
      // than fit and has to scroll like the workspace's does.
      ...Array.from({ length: 12 }, (_, index) => ({
        key: `owner${index}`,
        name: `Owner ${index}`,
      })),
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
      ...Array.from({ length: 12 }, (_, index) => ({
        key: `book${index}`,
        ownerKey: `owner${index}`,
        displayName: `Book ${index}`,
      })),
    ],
    candidates: [
      {
        key: "jane",
        matchmakerKey: "book",
        userKey: "jane",
        membership: "joined",
        name: "Jane Member",
        messages: LONG_THREAD,
        // Enough of a profile that the panel has its own reason to scroll.
        profile: {
          notes: Object.fromEntries(
            Array.from({ length: 20 }, (_, index) => [
              `note${index + 1}`,
              `Note ${index + 1}: something worth remembering.`,
            ]),
          ),
        },
      },
      // The rest of the book, so the candidate list overflows its column.
      ...Array.from({ length: 30 }, (_, index) => ({
        key: `filler${index}`,
        matchmakerKey: "book",
        name: `Filler Candidate ${index}`,
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        key: `janeIn${index}`,
        matchmakerKey: `book${index}`,
        userKey: "jane",
        membership: "joined" as const,
        name: "Jane Member",
      })),
    ],
  });
});

/** How far the window itself can scroll, and how far it has. */
async function windowScroll(page: Page) {
  return page.evaluate(() => ({
    overflow: Math.round(
      document.documentElement.scrollHeight - window.innerHeight,
    ),
    scrolledTo: Math.round(window.scrollY),
  }));
}

/** A scroll container's own numbers. */
async function scrollState(locator: Locator) {
  return locator.evaluate((element) => ({
    scrollTop: Math.round(element.scrollTop),
    // Rounded before comparing: a fractional layout leaves `scrollHeight` a
    // pixel over `clientHeight` in a box with nothing to scroll.
    scrollable: Math.round(element.scrollHeight - element.clientHeight) > 1,
  }));
}

/** Nothing may overflow the viewport vertically: the frame is the screen. */
async function expectNoPageScroll(page: Page) {
  const { overflow, scrolledTo } = await windowScroll(page);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(scrolledTo).toBe(0);
}

/** The composer sits on the bottom edge of the viewport, in full. */
async function expectComposerOnScreen(page: Page, composer: Locator) {
  const box = await composer.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null)
    throw new Error("No composer on screen");
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(viewport.height);
}

/**
 * Where a column's first horizontal rule starts, in page coordinates.
 *
 * The two headers draw it as their own `border-b`, which `box-sizing:
 * border-box` puts *inside* the element; the panel draws it as the accordion
 * divider under its first trigger, below that trigger's box. Taking the
 * element's own bottom border back off measures the same line either way.
 */
async function ruleTop(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Nothing to measure");
  const border = await locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderBottomWidth),
  );
  return Math.round(box.y + box.height - border);
}

test("the three columns' first row is one band, with the email beside the name", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("jane")}`,
  );

  const workspace = new WorkspacePage(page);
  const conversation = new ConversationPage(page);
  const panel = new CandidatePanelPage(page);
  const name = conversation.getCandidateName();
  const email = conversation.getCandidateEmail();
  await expect(name).toHaveText("Jane Member");
  await expect(email).toBeVisible();

  // One test rather than two, because it is one row: the email is beside the
  // name *because* the row is 44px, and a stacked title is what stopped it
  // fitting. The project's viewport is 1280 wide, past `lg`, so the panel is
  // alongside — below that there is no third rule to line up with, and a
  // phone shows one column at a time anyway.
  //
  // The panel has no header of its own up here, so its first rule is the
  // divider under Matches rather than a border of its own.
  const list = await ruleTop(workspace.getCandidatesHeader());
  const middle = await ruleTop(conversation.getHeader());
  const sections = await ruleTop(panel.getSection("Matches"));
  expect(middle).toBe(list);
  expect(sections).toBe(list);

  // Inline, not stacked: the email to the right of the name, and their boxes
  // overlapping vertically, which two stacked lines never would.
  const nameBox = await name.boundingBox();
  const emailBox = await email.boundingBox();
  if (nameBox === null || emailBox === null)
    throw new Error("Nothing to measure");
  expect(emailBox.x).toBeGreaterThan(nameBox.x + nameBox.width - 1);
  expect(emailBox.y).toBeLessThan(nameBox.y + nameBox.height);
  expect(nameBox.y).toBeLessThan(emailBox.y + emailBox.height);
});

test("the workspace's three columns scroll one at a time, and the composer stays put", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("jane")}`,
  );

  const workspace = new WorkspacePage(page);
  const conversation = new ConversationPage(page);
  const panel = new CandidatePanelPage(page);
  await expect(conversation.getCandidateName()).toHaveText("Jane Member");
  // Profile rather than Details: 20 notes is the panel's own reason to scroll.
  await panel.openSection("Profile");
  await expect(panel.getNotes().first()).toBeVisible();

  const list = workspace.getCandidatesScroll();
  const thread = conversation.getThread();
  const sections = panel.getScroll();

  // All three have more than fits, and the page has taken none of it on.
  for (const column of [list, thread, sections]) {
    expect((await scrollState(column)).scrollable).toBe(true);
  }
  await expectNoPageScroll(page);
  await expectComposerOnScreen(page, conversation.getComposer());

  // The thread opens on its newest message, with the list and the panel at
  // the top of theirs: it scrolled itself, not the page.
  await expect(conversation.getMessages().last()).toBeInViewport();
  expect((await scrollState(thread)).scrollTop).toBeGreaterThan(0);
  expect((await scrollState(list)).scrollTop).toBe(0);
  expect((await scrollState(sections)).scrollTop).toBe(0);
  await expectNoPageScroll(page);
  await expectComposerOnScreen(page, conversation.getComposer());

  // Scrolling one column moves that column and nothing else. The composer
  // is below the messages rather than in them, so it doesn't move at all.
  await thread.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(conversation.getMessages().first()).toBeInViewport();
  await expectComposerOnScreen(page, conversation.getComposer());

  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect((await scrollState(list)).scrollTop).toBeGreaterThan(0);
  expect((await scrollState(thread)).scrollTop).toBe(0);
  await expectNoPageScroll(page);

  await sections.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect((await scrollState(sections)).scrollTop).toBeGreaterThan(0);
  expect((await scrollState(thread)).scrollTop).toBe(0);
  await expectNoPageScroll(page);

  // The header above the columns is the app's frame and never scrolls away.
  await expect(workspace.getName()).toBeInViewport();
});

test("the candidate shell's columns scroll the same way", async ({ page }) => {
  await signInAs(page, world.email("jane"));
  const shell = new CandidateShellPage(page);
  await shell.goto(world.username("book"));

  const chat = new CandidateChatPage(page);
  await expect(chat.getMatchmakerName()).toHaveText("Maya's Book");

  const list = shell.getMatchmakerListScroll();
  const thread = chat.getThread();
  expect((await scrollState(list)).scrollable).toBe(true);
  expect((await scrollState(thread)).scrollable).toBe(true);
  await expect(chat.getMessages().last()).toBeInViewport();
  await expectNoPageScroll(page);
  await expectComposerOnScreen(page, chat.getComposer());

  await thread.evaluate((element) => {
    element.scrollTop = 0;
  });
  expect((await scrollState(list)).scrollTop).toBe(0);
  await expectNoPageScroll(page);
  await expectComposerOnScreen(page, chat.getComposer());

  // The list's footer is below its scroller, not inside it: "Become a
  // matchmaker" stays reachable without scrolling to the end of the list.
  await expect(shell.getCreateMatchmakerLink()).toBeInViewport();
});

test("a phone keeps the composer on screen while the thread scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 380, height: 700 });
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("jane")}`,
  );

  const conversation = new ConversationPage(page);
  await expect(conversation.getCandidateName()).toBeVisible();
  // The newest message and the composer, both on a 700px screen.
  await expect(conversation.getMessages().last()).toBeInViewport();
  await expectNoPageScroll(page);
  await expectComposerOnScreen(page, conversation.getComposer());

  await conversation.getThread().evaluate((element) => {
    element.scrollTop = 0;
  });
  await expectNoPageScroll(page);
  await expectComposerOnScreen(page, conversation.getComposer());
});
