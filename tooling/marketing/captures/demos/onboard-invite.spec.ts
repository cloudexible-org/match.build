import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  ConversationPage,
  OnboardPage,
  WorkspacePage,
} from "@repo/harness/page-objects/app/matchmaker.page";
import { SCRATCH_DIR } from "@repo/harness/paths";
import type { Scenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";
import { Director } from "../../lib/director";
import { seedScene } from "../../lib/scene";

/**
 * The problem the product opens on: a book that lives in Instagram DMs.
 *
 * A matchmaker onboards someone she has been talking to for weeks — her
 * handle, her address, and the conversation so far pasted straight in — and
 * the thread arrives in the app already carrying its own history, marked
 * "Only visible to you". That last part is the beat that matters: the import
 * is hers, not the candidate's, and the app says so on camera.
 *
 * **Not a test.** It asserts nothing about the app; it photographs it. A
 * failure here means the clip could not be filmed, not that onboarding is
 * broken — the coverage lives in
 * `tooling/e2e/specs/app-convex/onboarding.spec.ts`.
 *
 *   pnpm --filter marketing exec playwright test captures/demos/onboard-invite.spec.ts
 *   pnpm render:demo -- --name onboard-invite
 */
const NAME = "onboard-invite";
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
 * The pasted history. Written to be *read* at a glance in a single frame:
 * four short turns that establish these two already know each other, which is
 * the whole reason the import exists.
 */
const PASTED = [
  "Aisha: Hi! Priya said you'd be the person to talk to 😊",
  "Me: She did mention you — lovely to hear from you!",
  "Aisha: I've been told I'm hard to match. Consider it a challenge.",
  "Me: Challenge accepted. Let's move somewhere I can keep notes.",
].join("\n");

/** Onboarded on camera, so it cannot be seeded. */
const NEW_CANDIDATE = {
  name: "Aisha Rahman",
  email: "aisha.rahman@example.com",
  instagram: "aisha.rahman",
};

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScene({
    // Named and addressed explicitly: both are on camera in the book's rows,
    // and the seeder would otherwise append this run's namespace to anything
    // it had to invent. `example.com` is reserved by RFC 2606.
    users: [
      { key: "maya", name: "Maya Maker", email: "maya@makerandco.example.com" },
      { key: "priya", name: "Priya Raman", email: "priya.raman@example.com" },
      { key: "tom", name: "Tom Alvarez", email: "tom.alvarez@example.com" },
      { key: "nadia", name: "Nadia Haddad", email: "nadia.haddad@example.com" },
    ],
    matchmakers: [
      {
        key: "book",
        ownerKey: "maya",
        displayName: "Maya Maker",
        businessName: "Maker & Co.",
        voice: "Warm, brief, curious. Never salesy.",
      },
    ],
    // A working book to onboard *into* — a form filled against an empty list
    // reads as a first-run wizard rather than as a working day.
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
        key: "nadia",
        matchmakerKey: "book",
        userKey: "nadia",
        membership: "joined",
        name: "Nadia Haddad",
        messages: [{ author: "candidate", body: "Yes — Friday works for me." }],
      },
    ],
  });
});

test("onboarding a candidate from a pasted DM history", async ({ page }) => {
  const director = new Director(page, {
    name: NAME,
    outDir: OUT,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
  });

  // Both before the first navigation: an init script only applies to documents
  // opened after it is registered.
  await page.addInitScript(() => {
    localStorage.setItem("matchmaker-theme", "light");
    localStorage.setItem("matchmaker-push-nudge-dismissed", "1");
  });
  await director.start();

  await signInAs(page, world.email("maya"));

  const workspace = new WorkspacePage(page);
  const onboard = new OnboardPage(page);
  const conversation = new ConversationPage(page);

  // ── 1. The book, three people in ───────────────────────────────────────────
  await workspace.goto(world.username("book"));
  await workspace.getRoot().waitFor({ state: "visible" });
  // By position, not merely presence: `networkidle` is satisfied while a Convex
  // subscription still has an update in flight, and a list photographed early
  // reshuffles a second into the clip.
  await expect(workspace.getCandidates().getByRole("listitem")).toHaveCount(3);
  await page.waitForLoadState("networkidle");
  await director.hold(2200, "the book");

  // ── 2. Onboard ─────────────────────────────────────────────────────────────
  const onboardLink = workspace.getOnboardLink();
  await director.transition(
    async () => {
      await onboardLink.click();
      await onboard.getForm().waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle");
    },
    { press: onboardLink, style: "fade", settleMs: 900, label: "the form" },
  );

  // ── 3. Who she is ──────────────────────────────────────────────────────────
  await director.type(onboard.getEmailInput(), NEW_CANDIDATE.email, {
    chunk: 3,
    settleMs: 300,
  });
  await director.type(onboard.getNameInput(), NEW_CANDIDATE.name, {
    chunk: 2,
    settleMs: 450,
  });

  // ── 4. Where she came from ─────────────────────────────────────────────────
  await director.click(onboard.getAddHandleButton(), {
    settleMs: 350,
    label: "where she came from",
  });
  const handleRow = onboard.getHandleRows().last();
  await handleRow.getByRole("combobox").selectOption({ label: "Instagram" });
  await director.type(handleRow.getByRole("textbox"), NEW_CANDIDATE.instagram, {
    chunk: 3,
    settleMs: 500,
  });

  // ── 5. The conversation so far ─────────────────────────────────────────────
  // `fill`, not `type`: this is a paste, and it should land in one frame the
  // way a paste does. Typing four lines would also cost ~40 screenshots.
  await onboard.getHistoryInput().click();
  await onboard.getHistoryInput().fill(PASTED);
  await director.hold(2900, "the DMs, pasted in");

  // ── 6. Into the app, history and all ───────────────────────────────────────
  const submit = onboard.getSubmitButton();
  await director.transition(
    async () => {
      await submit.click();
      await conversation.getRoot().waitFor({ state: "visible" });
      await expect(conversation.getCandidateName()).toHaveText(
        NEW_CANDIDATE.name,
      );
      await conversation.getMessages().first().waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle");
    },
    { press: submit, style: "fade", settleMs: 1200, label: "onboarded" },
  );

  // ── 7. "Only visible to you" ───────────────────────────────────────────────
  // The payoff, and the longest hold: the imported history is hers, the app
  // says so, and the invitation is already out. This is the poster frame.
  await expect(conversation.getMessages().first()).toContainText(
    "Only visible to you",
  );
  await director.hideCursor();
  await director.hold(4500, "her import, marked private");

  const manifest = director.finish();
  console.log(
    `\n  ${NAME}: ${(director.durationMs / 1000).toFixed(2)}s across ` +
      `${manifest.timeline.length} beats → ${OUT}\n` +
      `  Render it:  pnpm render:demo -- --name ${NAME}\n`,
  );
});
