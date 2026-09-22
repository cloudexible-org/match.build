import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { signInToAdmin } from "@repo/harness/accounts";
import { AiUsagePage } from "@repo/harness/page-objects/admin/ai-usage.page";
import { AdminLayout } from "@repo/harness/page-objects/admin/layout.page";
import { SCRATCH_DIR } from "@repo/harness/paths";
import type { Scenario } from "@repo/harness/scenario";
import { SEED_ADMINS } from "@repo/harness/seed";
import { Director } from "../../lib/director";
import { seedScene } from "../../lib/scene";

/**
 * What the agents cost, to the cent — the shortest clip here, on purpose.
 *
 * Every generation the three agents make records its own token counts against
 * the matchmaker whose book it was for, and this page prices them. It is the
 * answer to the question a matchmaker running this as a business actually
 * asks, and the reason the product can be sold per seat rather than guessed at.
 *
 * Filmed against `apps/admin`, so the filename is prefixed `admin-`: the
 * `capture-admin` project in `playwright.config.ts` matches that prefix and
 * points `baseURL` at the admin app. Without it this would photograph
 * `apps/app` at `/admin/usage` and get a 404.
 *
 * **The tokens are seeded, because they cannot be earned here.** The Convex AI
 * gateway needs a paid Convex Cloud deployment and this runs against a local
 * anonymous one, so no capture can make a real model call. The arithmetic on
 * screen is the product's own, over rows a real run would have written.
 *
 * **Not a test.** The coverage lives in
 * `tooling/e2e/specs/admin-convex/ai-usage.spec.ts`.
 *
 *   pnpm --filter marketing exec playwright test captures/demos/admin-ai-cost.spec.ts
 *   pnpm render:demo -- --name admin-ai-cost
 */
const NAME = "admin-ai-cost";
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
 * The real model id, not `scenarioAiModel(ns)`.
 *
 * The suite namespaces it because `aiGenerations` and `aiModelRates` are
 * global and several spec files run at once, so each needs a model nobody else
 * is touching. A capture has no such problem — it asserts nothing, and this is
 * the only demo that writes generations — and the id is *on camera*, where
 * `openai/gpt-5.6-luna-e2db62e4b` would read as a mistake.
 */
const MODEL = "openai/gpt-5.6-luna";

/** What the gateway charges for it, in dollars per million tokens. */
const RATE = { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 };

const admin = SEED_ADMINS.find((a) => a.slug === "admin-ai");
if (admin === undefined) throw new Error("No admin-ai account in the seed");

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScene({
    users: [{ key: "maya", name: "Maya Maker" }],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maker & Co." },
    ],
    /**
     * A fortnight of a working book: the conversation agent drafting replies
     * every day, the profile agent reading threads behind it, and the voice
     * agent occasionally. Spread over `daysAgo` so the by-day table has a
     * shape and the window buttons have something to include and exclude.
     */
    generations: Array.from({ length: 14 }, (_, day) => [
      {
        agent: "conversation" as const,
        model: MODEL,
        matchmakerKey: "book",
        inputTokens: 120_000 + day * 4_000,
        outputTokens: 9_000 + day * 400,
        cachedInputTokens: 60_000,
        daysAgo: day,
        rate: RATE,
      },
      {
        agent: "candidate_profile" as const,
        model: MODEL,
        matchmakerKey: "book",
        inputTokens: 40_000 + day * 1_500,
        outputTokens: 2_000 + day * 120,
        daysAgo: day,
        rate: RATE,
      },
    ]).flat(),
  });
});

test("what the agents spent", async ({ page }) => {
  const director = new Director(page, {
    name: NAME,
    outDir: OUT,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
  });

  await page.addInitScript(() => {
    localStorage.setItem("matchmaker-theme", "light");
  });
  await director.start();

  // Driven, not photographed: no `hold` runs until the usage page is up, so
  // the sign-in screens cost frames only if something asks for them.
  await signInToAdmin(page, admin.email);

  /**
   * Wait for the signed-in frame before navigating anywhere.
   *
   * `signInToAdmin` returns as soon as the code is accepted, and the admin app
   * is *still redirecting* at that moment (`/admin/sign-in` → `/admin/audit`).
   * Calling `usage.goto()` into that redirect cancels it, the app re-resolves a
   * session it has not finished storing, and the take ends up back on the
   * sign-in form — which is what this capture did for a full five-minute
   * timeout before the wait was added. The sidebar is the honest signal that
   * the session landed; a fixed sleep would only be this race run slower.
   */
  const layout = new AdminLayout(page);
  await layout.getSidebar().waitFor({ state: "visible" });

  const usage = new AiUsagePage(page);

  // ── 1. The bill ───────────────────────────────────────────────────────────
  await usage.goto();
  await usage.getHeading().waitFor({ state: "visible" });
  await expect(usage.getTile("cost")).toBeVisible();
  await expect(usage.getModel(MODEL)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await director.hideCursor();
  await director.hold(3400, "what the agents cost");
  await director.showCursor();

  // ── 2. A month of it ──────────────────────────────────────────────────────
  await director.click(usage.getWindow(30), {
    settleMs: 3400,
    label: "a month of it",
  });

  // ── 3. Priced per model, and editable ─────────────────────────────────────
  // The rate card is the point: the gateway's prices change, and an admin
  // re-prices history without a deploy.
  await director.scrollTo(null, 900, 10);
  await director.hideCursor();
  await director.hold(4200, "priced per model");

  const manifest = director.finish();
  console.log(
    `\n  ${NAME}: ${(director.durationMs / 1000).toFixed(2)}s across ` +
      `${manifest.timeline.length} beats → ${OUT}\n` +
      `  Render it:  pnpm render:demo -- --name ${NAME}\n`,
  );
});
