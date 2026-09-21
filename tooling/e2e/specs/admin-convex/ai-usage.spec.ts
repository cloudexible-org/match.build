import { expect, test } from "@playwright/test";
import { signInToAdmin } from "@repo/harness/accounts";
import { AiUsagePage } from "@repo/harness/page-objects/admin/ai-usage.page";
import { AuditTrailPage } from "@repo/harness/page-objects/admin/audit-trail.page";
import { AdminLayout } from "@repo/harness/page-objects/admin/layout.page";
import {
  type Scenario,
  scenarioAiModel,
  scenarioNamespace,
  seedScenario,
} from "@repo/harness/scenario";
import { SEED_ADMINS } from "@repo/harness/seed";

/**
 * The usage page (`/admin/usage`): what the agents have spent, and what an admin
 * can price it at.
 *
 * **The tokens are seeded, because they cannot be earned here.** The Convex AI
 * gateway needs a paid Convex Cloud deployment and this suite drives a local
 * anonymous one, so no spec can make a real model call — the scenario writes the
 * generations a run would have written (`seed/e2e/scenario.ts`).
 *
 * `aiGenerations` and `aiModelRates` are global, like `aiAgentSettings`: the page
 * adds up the whole deployment, so the totals at the top of it are not this
 * file's to assert on. It therefore owns **one model id of its own**
 * (`scenarioAiModel(ns)`) and asserts on that model's card and on its own
 * matchmaker's row, both of which are exact however many other files are running
 * beside it.
 */

const admin = SEED_ADMINS.find((a) => a.slug === "admin-usage");
const ns = scenarioNamespace();
const MODEL = scenarioAiModel(ns);

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    ns,
    users: [{ key: "maya" }],
    matchmakers: [{ key: "book", ownerKey: "maya" }],
    generations: [
      // Priced: 1M input at $3/M and 200k output at $15/M is $3 + $3 = $6.
      {
        agent: "conversation",
        model: MODEL,
        matchmakerKey: "book",
        inputTokens: 1_000_000,
        outputTokens: 200_000,
        rate: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
      },
      // A second run on the same model, three days back, so the window buttons
      // have something to include and exclude.
      {
        agent: "candidate_profile",
        model: MODEL,
        matchmakerKey: "book",
        inputTokens: 500_000,
        outputTokens: 100_000,
        daysAgo: 3,
        rate: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
      },
    ],
  });
});

test("an admin reads what the AI cost, and prices a model", async ({
  page,
}) => {
  if (!admin) throw new Error("No seed admin 'admin-usage'");
  await signInToAdmin(page, admin.email);

  await new AdminLayout(page).getNavLink("AI usage").click();
  const usage = new AiUsagePage(page);
  await expect(usage.getHeading()).toBeVisible();

  // A week covers both seeded runs: 1.5M input, 300k output, $9.
  await expect(usage.getWindow(7)).toHaveAttribute("aria-pressed", "true");
  const model = usage.getModel(MODEL);
  await expect(model).toContainText("2 generations");
  await expect(usage.getModelCost(MODEL)).toHaveText("$9.00");

  // The matchmaker whose book it is on, with its own spend beside it.
  await expect(
    usage.getRow("usage-by-matchmaker", world.displayName("book")),
  ).toContainText("$9.00");

  // Both agents that ran are listed, and the one that didn't is a zero rather
  // than a missing row.
  await expect(usage.getRow("usage-by-agent", "Conversation")).toContainText(
    "$6.00",
  );
  await expect(usage.getRow("usage-by-agent", "Voice profile")).toContainText(
    "0",
  );

  // Today alone leaves the three-day-old run out, and the day table shrinks to
  // match the window.
  await usage.getWindow(1).click();
  await expect(usage.getModel(MODEL)).toContainText("1 generation,");
  await expect(usage.getModelCost(MODEL)).toHaveText("$6.00");
  await expect(usage.getDayRows()).toHaveCount(1);

  await usage.getWindow(30).click();
  await expect(usage.getDayRows()).toHaveCount(30);
  await expect(usage.getModelCost(MODEL)).toHaveText("$9.00");
});

test("a rate is refused unless both halves are given, and clearing it unprices the model", async ({
  page,
}) => {
  if (!admin) throw new Error("No seed admin 'admin-usage'");
  await signInToAdmin(page, admin.email);

  // Reached through the nav rather than a `goto`: signing in is still in flight
  // when `signInToAdmin` returns, and navigating away would abort it.
  await new AdminLayout(page).getNavLink("AI usage").click();
  const usage = new AiUsagePage(page);
  await expect(usage.getHeading()).toBeVisible();
  await expect(usage.getRateInput(MODEL, "Input")).toHaveValue("3");

  // One rate without the other would bill every reply as free — refused by the
  // same rule the mutation uses, and nothing is saved.
  await usage.getRateInput(MODEL, "Output").fill("");
  await usage.getRateSave(MODEL).click();
  await expect(usage.getRateError(MODEL)).toContainText("both");
  await expect(usage.getModelCost(MODEL)).toHaveText("$9.00");

  // A price per token in a field that means per million: the typo the ceiling
  // is there to catch.
  await usage.getRateInput(MODEL, "Output").fill("0.000015");
  await usage.getRateInput(MODEL, "Input").fill("30000");
  await usage.getRateSave(MODEL).click();
  await expect(usage.getRateError(MODEL)).toContainText("per token");

  // Clearing both leaves the model unpriced. The tokens already spent keep the
  // cost they were recorded with — a rate change prices new runs only — so the
  // card still shows what this window came to.
  await usage.getRateInput(MODEL, "Input").fill("");
  await usage.getRateInput(MODEL, "Output").fill("");
  await usage.getRateSave(MODEL).click();
  await expect(usage.getRateError(MODEL)).toHaveCount(0);
  await expect(usage.getRateInput(MODEL, "Input")).toHaveValue("");
  await expect(usage.getModelCost(MODEL)).toHaveText("$9.00");

  // Both changes are in the platform trail, which is where a rate's history is
  // kept.
  const trail = new AuditTrailPage(page);
  await trail.goto();
  await expect(
    trail.getEvents().filter({ hasText: "Model rate changed" }).first(),
  ).toBeVisible();
});
