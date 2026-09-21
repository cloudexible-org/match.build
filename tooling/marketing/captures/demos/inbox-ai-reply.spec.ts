import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  ConversationPage,
  WorkspacePage,
} from "@repo/harness/page-objects/app/matchmaker.page";
import { SuggestionsPage } from "@repo/harness/page-objects/app/suggestions.page";
import { SCRATCH_DIR } from "@repo/harness/paths";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";
import { Director } from "../../lib/director";

/**
 * The pitch's core claim, in twelve seconds: a matchmaker's whole book in one
 * column, a candidate's thread in the next, and a reply already drafted in the
 * matchmaker's own voice waiting above the composer.
 *
 * **Not a test.** It asserts nothing about the app; it photographs it. A
 * failure here means the clip could not be filmed, not that the inbox is
 * broken — the coverage lives in `tooling/e2e/specs/app-convex/`, and this file
 * is deliberately not in that suite.
 *
 *   pnpm capture:demo
 *   pnpm render:demo -- --name inbox-ai-reply
 *
 * Every `hold` below is a deliberate beat, not a wait for the app. The
 * durations *are* the edit: change them here, re-render, and the clip re-paces
 * without touching a browser.
 */
const NAME = "inbox-ai-reply";
const OUT = join(SCRATCH_DIR, "marketing", "demos", NAME);

/**
 * 16:9 at 2x — 2880x1620 device pixels, rendered down to 1920x1080. A laptop's
 * shape, which is what a deck slide is, and wide enough that all three columns
 * of the workspace are on screen at once. That third column is most of the
 * argument: filming this at phone width would show one column at a time and
 * lose it.
 */
const VIEWPORT = { width: 1440, height: 810 };
const SCALE = 2;

test.use({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: "light",
});

// ~150 screenshots at 2880x1620, plus a Convex round trip behind each click.
test.setTimeout(5 * 60_000);

/**
 * The drafted replies. Seeded, and they have to be: generating one needs the
 * Convex AI gateway, which needs a paid Cloud deployment, and this runs against
 * the local anonymous backend where AI is off. Everything the viewer sees a
 * person *do* with the draft is the real product; only its authorship is
 * staged. Same constraint as
 * `tooling/e2e/specs/app-convex/reply-suggestions.spec.ts`.
 */
const DRAFTS = [
  "That sounds like a wonderful weekend. What drew you to the trail?",
  "Glad the hike went well — how did it compare to the last one?",
  "Lovely — I've someone in mind who'd have been on that trail too.",
];

/** What the viewer reads, so it is written to be read, not to be plausible. */
const THREAD = [
  {
    author: "matchmaker" as const,
    body: "Morning Sam — how was the weekend?",
  },
  {
    author: "candidate" as const,
    body: "Really good! Did the Bruce Trail on Saturday, about 14km.",
  },
  {
    author: "candidate" as const,
    body: "Then a long dinner with friends. Exactly the kind of weekend I want more of.",
  },
];

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    // Emails as well as names, because both are on camera: the candidate list,
    // the conversation header and the Details panel all show an address, and
    // the one the seeder invents carries this run's namespace
    // (`sam.e7cd29bdc@matchmaker-e2e.test`). `example.com` is reserved by
    // RFC 2606, so nothing here can ever resolve to someone real.
    users: [
      { key: "maya", name: "Maya Maker", email: "maya@makerandco.example.com" },
      { key: "sam", name: "Sam Okonkwo", email: "sam.okonkwo@example.com" },
      { key: "priya", name: "Priya Raman", email: "priya.raman@example.com" },
      { key: "tom", name: "Tom Alvarez", email: "tom.alvarez@example.com" },
      { key: "nadia", name: "Nadia Haddad", email: "nadia.haddad@example.com" },
      { key: "jonas", name: "Jonas Berg", email: "jonas.berg@example.com" },
    ],
    // Named explicitly so nothing on camera carries the run's namespace —
    // the seeder only appends it to names it had to invent. The username
    // still does, but that lives in the URL, which a screenshot never shows.
    matchmakers: [
      {
        key: "book",
        ownerKey: "maya",
        displayName: "Maya Maker",
        businessName: "Maker & Co.",
        voice: "Warm, brief, curious. Never salesy.",
      },
    ],
    /**
     * **Sam last, and that is load-bearing.** The list is ordered by the
     * conversation's `lastMessageAt`, and the seeder ends every thread at the
     * same `now` — so the whole book ties and the index breaks the tie on
     * `_creationTime`, newest first. Seeding Sam first put him at the *bottom*,
     * and the opening frame, taken before the subscription settled, caught him
     * at the top: the list visibly reshuffled two seconds into the clip.
     */
    candidates: [
      // The rest of the book, so the first column reads as a working inbox
      // rather than a single row.
      {
        key: "priya",
        matchmakerKey: "book",
        userKey: "priya",
        membership: "joined",
        name: "Priya Raman",
        messages: [
          { author: "candidate" as const, body: "Thanks — that's helpful." },
        ],
      },
      {
        key: "tom",
        matchmakerKey: "book",
        userKey: "tom",
        membership: "joined",
        name: "Tom Alvarez",
        messages: [
          { author: "matchmaker" as const, body: "I'll be in touch Thursday." },
        ],
      },
      {
        key: "nadia",
        matchmakerKey: "book",
        userKey: "nadia",
        membership: "joined",
        name: "Nadia Haddad",
        messages: [
          { author: "candidate" as const, body: "Yes — Friday works for me." },
        ],
      },
      {
        key: "jonas",
        matchmakerKey: "book",
        name: "Jonas Berg",
        // No `userKey`, so no account to take an address from: an invited
        // candidate's email is the one the invitation went to.
        email: "jonas.berg@example.com",
        membership: "invited",
      },
      {
        key: "sam",
        matchmakerKey: "book",
        userKey: "sam",
        membership: "joined",
        name: "Sam Okonkwo",
        messages: THREAD,
        unreadForMatchmaker: true,
        replyDrafts: DRAFTS,
        // The third column has to have something in it: an empty panel next to
        // a full thread makes the workspace look like two columns and a gap.
        profile: {
          facts: {
            locationCity: "Toronto",
            lookingFor: "marriage",
            wantsKids: "yes",
          },
          notes: {
            summary: "Hikes most weekends. Wants someone who'd come along.",
          },
        },
      },
    ],
  });
});

test("inbox to a drafted reply", async ({ page }) => {
  const director = new Director(page, {
    name: NAME,
    outDir: OUT,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
  });

  /**
   * Both of these must be registered before the first navigation: an init
   * script only applies to documents opened after it is added, so a page that
   * is already loaded keeps running without them.
   *
   * The push nudge is the reason for the second one — it appears *just after a
   * message is sent*, which is precisely the closing shot of this clip.
   */
  await page.addInitScript(() => {
    localStorage.setItem("matchmaker-theme", "light");
    localStorage.setItem("matchmaker-push-nudge-dismissed", "1");
  });
  await director.start();

  await signInAs(page, world.email("maya"));

  const workspace = new WorkspacePage(page);
  const conversation = new ConversationPage(page);
  const suggestions = new SuggestionsPage(page);

  // ── 1. The book ────────────────────────────────────────────────────────────
  await workspace.goto(world.username("book"));
  await workspace.getRoot().waitFor({ state: "visible" });
  // Waited on by *position*, not just presence. `networkidle` is satisfied
  // while a Convex subscription still has an update in flight, and the first
  // take caught the list before it settled — so the opening frame showed one
  // order and every frame after it showed another, which reads as a glitch.
  await expect(
    workspace.getCandidates().getByRole("listitem").first(),
  ).toContainText("Sam Okonkwo");
  await page.waitForLoadState("networkidle");
  await director.hold(1100, "the book");

  // ── 2. Into the conversation ───────────────────────────────────────────────
  const samRow = workspace.getCandidateRow("Sam Okonkwo");
  await director.transition(
    async () => {
      await samRow.click();
      await conversation.getRoot().waitFor({ state: "visible" });
      await conversation.getMessages().last().waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle");
    },
    { press: samRow, style: "fade", settleMs: 1400, label: "the thread" },
  );

  // ── 3. The draft, which is the whole point ─────────────────────────────────
  // Waited for rather than held blind: the suggestion row mounts from a
  // separate query, and photographing before it lands gives a frame of empty
  // composer where the payoff should be.
  await suggestions.getRow("reply").waitFor({ state: "visible" });
  await director.hold(1600, "a reply, already drafted");

  // ── 4. The matchmaker makes it hers ────────────────────────────────────────
  // Edit rather than Send: "the AI wrote it and she pressed go" is the story
  // the product is *not* selling. She takes the draft and changes it.
  await director.click(
    suggestions.getCard("reply").getByTestId("suggestion-keep-open"),
    { settleMs: 700, label: "edit the draft" },
  );

  // `Director.type` puts the caret at the end of the draft it is appending to;
  // clicking the field to focus it would otherwise drop the caret wherever the
  // pointer landed, mid-sentence.
  await director.type(conversation.getMessageInput(), " Which one next?", {
    chunk: 2,
    settleMs: 650,
  });

  // ── 5. Sent — and it lands as her own words ────────────────────────────────
  await director.click(conversation.getSendButton(), {
    // The longest hold in the clip. This is the frame the poster is cut from,
    // and the one a viewer should still be reading when it loops.
    settleMs: 2000,
    label: "sent",
  });

  const manifest = director.finish();
  console.log(
    `\n  ${NAME}: ${(director.durationMs / 1000).toFixed(2)}s across ` +
      `${manifest.timeline.length} beats → ${OUT}\n` +
      `  Render it:  pnpm render:demo -- --name ${NAME}\n`,
  );
});
