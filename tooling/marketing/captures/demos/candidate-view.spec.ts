import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  CandidateChatPage,
  CandidateShellPage,
} from "@repo/harness/page-objects/app/candidate.page";
import { ConversationPage } from "@repo/harness/page-objects/app/matchmaker.page";
import { SCRATCH_DIR } from "@repo/harness/paths";
import type { Scenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";
import { Director } from "../../lib/director";
import { seedScene } from "../../lib/scene";

/**
 * The same conversation, from both ends — which is the only honest way to show
 * what a candidate can and cannot see.
 *
 * Maya's thread carries a note she wrote to herself, and the app marks it
 * "Only visible to you". The clip then signs in as Sam and opens the same
 * conversation: every message they actually exchanged is there, and the note
 * is not. Nothing is cropped or staged — it is one seeded thread photographed
 * twice, and the difference between the two frames is the access rule doing
 * its job.
 *
 * A split screen would have been the obvious way to film this and is the wrong
 * one: two half-width browsers make both sides illegible, and the viewer has
 * to trust that the right-hand pane is really a different account. A dissolve
 * between two full-width takes of *the same thread* makes the absence the
 * subject.
 *
 * **Not a test.** It asserts nothing about the app; it photographs it. The
 * coverage lives in `tooling/e2e/specs/app-convex/tenant-isolation.spec.ts`
 * and `candidate-shell.spec.ts`.
 *
 *   pnpm --filter marketing exec playwright test captures/demos/candidate-view.spec.ts
 *   pnpm render:demo -- --name candidate-view
 */
const NAME = "candidate-view";
const OUT = join(SCRATCH_DIR, "marketing", "demos", NAME);

const VIEWPORT = { width: 1440, height: 810 };
const SCALE = 2;

test.use({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: "light",
});

test.setTimeout(5 * 60_000);

/** What Maya wrote to herself. The one line Sam must never see. */
const PRIVATE_NOTE =
  "Note to self: he's shy about the first introduction — go slowly, and ask before sharing anything.";

const THREAD = [
  { author: "matchmaker" as const, body: "Morning Sam — how was the weekend?" },
  {
    author: "candidate" as const,
    body: "Really good! Did the Bruce Trail on Saturday, about 14km.",
  },
  {
    // Hers alone. Seeded as a private message because that is exactly the row
    // the product writes when she uses the note composer.
    author: "matchmaker" as const,
    visibility: "matchmaker" as const,
    body: PRIVATE_NOTE,
  },
  {
    author: "matchmaker" as const,
    body: "Lovely — I've someone in mind who'd have been on that trail too.",
  },
];

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScene({
    users: [
      { key: "maya", name: "Maya Maker", email: "maya@makerandco.example.com" },
      { key: "sam", name: "Sam Okonkwo", email: "sam.okonkwo@example.com" },
    ],
    matchmakers: [
      {
        key: "book",
        ownerKey: "maya",
        /**
         * Named explicitly, unlike most demos' books, because this is a clip
         * where the username is *on camera*: the candidate shell prints
         * `@username` under the matchmaker in both the list and the panel, and
         * the seeder's default photographs as `@e2db62e4b.book`.
         */
        username: "makerandco",
        displayName: "Maya Maker",
        voice: "Warm, brief, curious. Never salesy.",
      },
    ],
    candidates: [
      {
        key: "sam",
        matchmakerKey: "book",
        userKey: "sam",
        membership: "joined",
        name: "Sam Okonkwo",
        messages: THREAD,
      },
    ],
  });
});

test("the same thread, from both ends", async ({ page }) => {
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

  const conversation = new ConversationPage(page);
  const shell = new CandidateShellPage(page);
  const chat = new CandidateChatPage(page);

  // ── 1. Maya's side, note and all ──────────────────────────────────────────
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("sam")}`,
  );
  await conversation.getRoot().waitFor({ state: "visible" });
  await expect(conversation.getMessages()).toHaveCount(THREAD.length);
  await page.waitForLoadState("networkidle");
  await director.hideCursor();
  await director.hold(2200, "her thread");

  // ── 2. The line that is hers alone ────────────────────────────────────────
  await expect(
    conversation.getMessages().filter({ hasText: "Note to self" }),
  ).toContainText("Only visible to you");
  await director.hold(3600, "only visible to you");

  // ── 3. Now Sam's ──────────────────────────────────────────────────────────
  // A real second sign-in, not a filtered re-render: `signInAs` runs the same
  // Convex Auth flow over HTTP and swaps the session, so what lands next is
  // the server's answer to *his* identity.
  await director.transition(
    async () => {
      await signInAs(page, world.email("sam"));
      await page.goto("/app/");
      await shell.getRoot().waitFor({ state: "visible" });
      await chat.getMessages().first().waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle");
    },
    { style: "fade", durationMs: 420, settleMs: 1200, label: "Sam's side" },
  );

  // ── 4. Everything they said, and nothing she didn't ───────────────────────
  await expect(chat.getMessages()).toHaveCount(THREAD.length - 1);
  await expect(chat.getThread()).not.toContainText("Note to self");
  await director.hold(3900, "the note is not there");

  // ── 5. He is a participant, not a record ──────────────────────────────────
  await director.showCursor();
  await director.type(
    chat.getMessageInput(),
    "Ha — I'd like that. Tell me more?",
    {
      chunk: 3,
      settleMs: 500,
    },
  );
  await director.click(
    chat.getComposer().getByRole("button", { name: /^Send/ }),
    { settleMs: 3200, label: "sent, from his side" },
  );

  const manifest = director.finish();
  console.log(
    `\n  ${NAME}: ${(director.durationMs / 1000).toFixed(2)}s across ` +
      `${manifest.timeline.length} beats → ${OUT}\n` +
      `  Render it:  pnpm render:demo -- --name ${NAME}\n`,
  );
});
