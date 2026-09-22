import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { CandidatePanelPage } from "@repo/harness/page-objects/app/candidate-panel.page";
import { ConversationPage } from "@repo/harness/page-objects/app/matchmaker.page";
import { SuggestionsPage } from "@repo/harness/page-objects/app/suggestions.page";
import { SCRATCH_DIR } from "@repo/harness/paths";
import type { Scenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";
import { Director } from "../../lib/director";
import { seedScene } from "../../lib/scene";

/**
 * "AI drafts, you decide", in one gesture.
 *
 * Sam mentions children in passing. The assistant does not write it into his
 * record — it *proposes* the entry, and quotes the sentence it heard underneath
 * so the matchmaker can check it rather than take it on trust. She approves,
 * the record moves, and the History tab names both of them: suggested by the
 * assistant, approved by her.
 *
 * That last frame is the argument. An agent that silently edited the record
 * would be a liability in this job; one that drafts and waits is an assistant.
 *
 * **Not a test.** It asserts nothing about the app; it photographs it. The
 * coverage lives in `tooling/e2e/specs/app-convex/candidate-profile.spec.ts`.
 *
 *   pnpm --filter marketing exec playwright test captures/demos/profile-builds-itself.spec.ts
 *   pnpm render:demo -- --name profile-builds-itself
 */
const NAME = "profile-builds-itself";
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
 * The sentence the proposal is built from, and the sentence quoted under it.
 * They are the same words on purpose: the viewer should be able to read the
 * message, then read the quote, and see that nothing was invented in between.
 */
const HEARD =
  "Honestly? Two, if I'm lucky. My sister's kids are the best part of my week.";

const THREAD = [
  { author: "matchmaker" as const, body: "Morning Sam — how was the weekend?" },
  {
    author: "candidate" as const,
    body: "Really good! Did the Bruce Trail on Saturday, about 14km.",
  },
  {
    author: "matchmaker" as const,
    body: "Sounds lovely. Do you picture children in the mix one day?",
  },
  { author: "candidate" as const, body: HEARD },
];

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScene({
    users: [
      { key: "maya", name: "Maya Maker", email: "maya@makerandco.example.com" },
      { key: "sam", name: "Sam Okonkwo", email: "sam.okonkwo@example.com" },
      { key: "priya", name: "Priya Raman", email: "priya.raman@example.com" },
      { key: "tom", name: "Tom Alvarez", email: "tom.alvarez@example.com" },
    ],
    matchmakers: [
      {
        key: "book",
        ownerKey: "maya",
        displayName: "Maya Maker",
        voice: "Warm, brief, curious. Never salesy.",
      },
    ],
    candidates: [
      {
        key: "priya",
        matchmakerKey: "book",
        userKey: "priya",
        membership: "joined",
        name: "Priya Raman",
        messages: [{ author: "candidate", body: "Thanks — that's helpful." }],
      },
      {
        key: "tom",
        matchmakerKey: "book",
        userKey: "tom",
        membership: "joined",
        name: "Tom Alvarez",
        messages: [
          { author: "matchmaker", body: "I'll be in touch Thursday." },
        ],
      },
      {
        key: "sam",
        matchmakerKey: "book",
        userKey: "sam",
        membership: "joined",
        name: "Sam Okonkwo",
        messages: THREAD,
        /**
         * A proposal nobody has answered — the state an agent produces and no
         * amount of clicking could reach. Seeded because generating one needs
         * the Convex AI gateway, which needs a paid Cloud deployment, and this
         * runs against the local anonymous backend. Everything the viewer sees
         * a person *do* with it is the real product; only its authorship is
         * staged.
         */
        profile: {
          facts: {
            locationCity: "Toronto",
            lookingFor: "marriage",
          },
          notes: {
            summary: "Hikes most weekends. Wants someone who'd come along.",
          },
          suggestions: [
            {
              kind: "facts",
              key: "wantsKids",
              value: "yes",
              quote: HEARD,
            },
          ],
        },
      },
    ],
  });
});

test("an agent proposes a fact and the matchmaker approves it", async ({
  page,
}) => {
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

  const conversation = new ConversationPage(page);
  const panel = new CandidatePanelPage(page);
  const suggestions = new SuggestionsPage(page);

  // ── 1. Sam's thread, and what he just said ────────────────────────────────
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("sam")}`,
  );
  await conversation.getRoot().waitFor({ state: "visible" });
  await expect(conversation.getMessages().last()).toContainText("if I'm lucky");
  await panel.getRoot().waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
  await director.hold(2600, "what Sam just said");

  // ── 2. His record as it stands ────────────────────────────────────────────
  await director.click(panel.getSection("Profile"), {
    settleMs: 1300,
    label: "his record so far",
  });

  // ── 3. The proposal, with his own words under it ──────────────────────────
  // Waited for rather than held blind: the row mounts from a separate query,
  // and photographing early gives a frame of empty composer where the payoff
  // should be.
  await suggestions.getRow("candidateProfile").waitFor({ state: "visible" });
  await expect(suggestions.getCard("candidateProfile")).toContainText(
    "if I'm lucky",
  );
  await director.hideCursor();
  await director.hold(4000, "proposed, and quoted");
  await director.showCursor();

  // ── 4. She decides ────────────────────────────────────────────────────────
  await director.click(
    suggestions.getCard("candidateProfile").getByTestId("suggestion-accept"),
    { settleMs: 1500, label: "approved" },
  );

  // ── 5. The record moved, and says who moved it ────────────────────────────
  await expect(panel.getField("wantsKids")).toContainText("yes");
  await expect(panel.getField("wantsKids")).toContainText(
    "Suggested by the assistant, approved by you",
  );
  await director.hideCursor();
  await director.hold(3200, "suggested by the assistant, approved by you");
  await director.showCursor();

  // ── 6. And the trail remembers ────────────────────────────────────────────
  await director.click(panel.getSection("History"), {
    settleMs: 3500,
    label: "the history",
  });

  const manifest = director.finish();
  console.log(
    `\n  ${NAME}: ${(director.durationMs / 1000).toFixed(2)}s across ` +
      `${manifest.timeline.length} beats → ${OUT}\n` +
      `  Render it:  pnpm render:demo -- --name ${NAME}\n`,
  );
});
