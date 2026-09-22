import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  CandidateChatPage,
  CandidateShellPage,
} from "@repo/harness/page-objects/app/candidate.page";
import {
  ConversationPage,
  WorkspacePage,
} from "@repo/harness/page-objects/app/matchmaker.page";
import { SCRATCH_DIR } from "@repo/harness/paths";
import { APP_URL } from "@repo/harness/playwright.config";
import type { Scenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";
import { Director } from "../../lib/director";
import { seedScene } from "../../lib/scene";

/**
 * Two people, one conversation, no refresh.
 *
 * Sam writes on his phone. Maya's book — a different account, a different
 * browser context, a different session — moves under her while she touches
 * nothing. There is no polling and no reload in this capture: the app holds a
 * Convex query subscription, and the message arrives because the server pushed
 * it.
 *
 * **This is the one clip that has to be filmed as a pair.** Two separate takes
 * would prove nothing at all — the claim is that the two screens moved
 * *together*, and only one screenshot pair per instant can show that. The
 * Director photographs both pages back to back for every beat and
 * `render-demo.mjs` pastes them side by side, so each finished frame is a
 * single moment on two machines rather than an edit.
 *
 * The widths are deliberately unequal: 960 gives Maya the two-column workspace
 * a laptop shows, 480 puts Sam on the phone layout. Filming both at the same
 * width would have read as two browser windows on one desk, which is not the
 * situation being demonstrated.
 *
 * **Not a test.** The coverage for what each side may see lives in
 * `tooling/e2e/specs/app-convex/chat.spec.ts` and `tenant-isolation.spec.ts`.
 *
 *   pnpm --filter marketing exec playwright test captures/demos/realtime-two-up.spec.ts
 *   pnpm render:demo -- --name realtime-two-up
 */
const NAME = "realtime-two-up";
const OUT = join(SCRATCH_DIR, "marketing", "demos", NAME);

/** Maya, on a laptop: wide enough for the list beside the conversation. */
const VIEWPORT = { width: 960, height: 810 };
/** Sam, on a phone: under the app's `md` breakpoint, so one column. */
const COMPANION_VIEWPORT = { width: 480, height: 810 };
const SCALE = 2;

test.use({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: "light",
});

test.setTimeout(5 * 60_000);

/** What Sam types on camera. Short: every character costs a frame on both pages. */
const SAMS_MESSAGE = "Just got back — Sunday works!";

const THREAD = [
  {
    author: "matchmaker" as const,
    body: "Morning Sam — are you free for a call this weekend?",
  },
];

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScene({
    users: [
      { key: "maya", name: "Maya Maker", email: "maya@makerandco.example.com" },
      { key: "sam", name: "Sam Okonkwo", email: "sam.okonkwo@example.com" },
      { key: "priya", name: "Priya Raman", email: "priya.raman@example.com" },
    ],
    matchmakers: [
      {
        key: "book",
        ownerKey: "maya",
        // On camera in the candidate shell's header, like `candidate-view`.
        username: "makerandco",
        displayName: "Maya Maker",
        businessName: "Maker & Co.",
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

test("he writes, her book moves", async ({ page, browser }) => {
  /**
   * Sam needs his own context, not merely his own page: `signInAs` keeps the
   * session in `localStorage`, which a second page in Maya's context would
   * share — and the clip would then be one account photographed twice.
   *
   * `browser.newContext` inherits nothing from the project, so the viewport,
   * the scale factor and `baseURL` are all passed again here.
   */
  const samContext = await browser.newContext({
    viewport: COMPANION_VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    baseURL: APP_URL,
  });
  const samPage = await samContext.newPage();

  const director = new Director(page, {
    name: NAME,
    outDir: OUT,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    companion: { page: samPage, viewport: COMPANION_VIEWPORT },
  });

  for (const p of [page, samPage]) {
    await p.addInitScript(() => {
      localStorage.setItem("matchmaker-theme", "light");
      localStorage.setItem("matchmaker-push-nudge-dismissed", "1");
    });
  }
  await director.start();

  // No pointer anywhere in this clip. The Director draws one cursor, on the
  // main page, and the hand doing the work here is on the *other* screen —
  // a pointer sitting still on Maya's side while Sam types would read as hers.
  await director.hideCursor();

  // ── Both sides, signed in as themselves ───────────────────────────────────
  const workspace = new WorkspacePage(page);
  const conversation = new ConversationPage(page);
  const shell = new CandidateShellPage(samPage);
  const chat = new CandidateChatPage(samPage);

  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId("sam")}`,
  );
  await conversation.getRoot().waitFor({ state: "visible" });
  await expect(conversation.getMessages()).toHaveCount(THREAD.length);

  await signInAs(samPage, world.email("sam"));
  /**
   * Straight at the conversation, by hash — not `/app/`.
   *
   * At a laptop width the shell lands on the first matchmaker by itself, which
   * is why `candidate-view.spec.ts` can simply open `/app/`. At 480 it does
   * not: the phone layout shows the matchmaker *list* and nothing else, and
   * this capture spent a take photographing an empty conversation region.
   * `/app/c#<username>` is the URL a notification email sends him to anyway.
   */
  await shell.goto(world.username("book"));
  await shell.getRoot().waitFor({ state: "visible" });
  await chat.getRoot().waitFor({ state: "visible" });
  await expect(chat.getMessages()).toHaveCount(THREAD.length);

  await page.waitForLoadState("networkidle");
  await samPage.waitForLoadState("networkidle");
  await director.hold(3000, "her laptop, his phone");

  // ── He types ──────────────────────────────────────────────────────────────
  // `Director.type` takes a locator on either page: it clicks the field
  // directly rather than gliding the pointer to it, so a companion field is
  // typed into without the main page's cursor going anywhere.
  await director.type(chat.getMessageInput(), SAMS_MESSAGE, {
    chunk: 2,
    settleMs: 1200,
  });

  // ── He sends — and both screens move ──────────────────────────────────────
  // Clicked directly, not through `Director.click`: that one animates the
  // cursor, and this button is on the screen the cursor does not live on.
  await chat.getComposer().getByRole("button", { name: /^Send/ }).click();

  // Waited for on *Maya's* page. This is the assertion the whole clip exists
  // to photograph, and it is the only place the capture waits on a screen it
  // did not touch: nothing was clicked on her laptop, so the message can only
  // have arrived over her Convex subscription.
  await expect(conversation.getMessages()).toHaveCount(THREAD.length + 1);
  await expect(conversation.getMessages().last()).toContainText(SAMS_MESSAGE);
  await expect(chat.getMessages()).toHaveCount(THREAD.length + 1);
  await page.waitForLoadState("networkidle");
  await samPage.waitForLoadState("networkidle");

  await director.hold(5500, "it lands on both, untouched");

  const manifest = director.finish();
  console.log(
    `\n  ${NAME}: ${(director.durationMs / 1000).toFixed(2)}s across ` +
      `${manifest.timeline.length} beats → ${OUT}\n` +
      `  Render it:  pnpm render:demo -- --name ${NAME}\n`,
  );

  await samContext.close();
});
