import { expect, test } from "@playwright/test";
import { SEED_ADMINS } from "../../../../packages/api/convex/seed/e2e/fixture";
import { signInToAdmin } from "../../accounts";
import { AiSettingsPage } from "../../page-objects/admin/ai-settings.page";
import { AuditTrailPage } from "../../page-objects/admin/audit-trail.page";
import { AdminLayout } from "../../page-objects/admin/layout.page";

/**
 * An admin sets up an agent from nothing, turns it off with the switch, and
 * turns it off again by clearing the model — the three states prd/phase-2.md
 * §4.4 cares about — and the trail records each change.
 *
 * `aiAgentSettings` is global by design, so unlike most specs this one cannot
 * seed its own private copy: there is one row per agent for the whole
 * deployment. It therefore owns the `voice_profile` agent for the length of the
 * run and touches no other. Any new spec that writes these settings must pick a
 * different agent.
 *
 * The e2e backend is never seeded with agents, so this starts from the state a
 * fresh deployment is in: nothing configured, everything off.
 */

const admin = SEED_ADMINS.find((a) => a.slug === "admin-ai");
const AGENT = "voice_profile" as const;

test("an admin configures an agent from nothing, and can turn it off two ways", async ({
  page,
}) => {
  if (!admin) throw new Error("No seed admin 'admin-ai'");
  await signInToAdmin(page, admin.email);

  await new AdminLayout(page).getNavLink("AI agents").click();
  const ai = new AiSettingsPage(page);
  await expect(ai.getHeading()).toBeVisible();

  // The e2e backend is a local anonymous deployment, which cannot reach the
  // gateway — so the page says so rather than implying these settings are
  // already doing something.
  await expect(ai.getNoGatewayNotice()).toBeVisible();

  // All three agents are listed, none set up, and each says *why* it is off.
  for (const agent of ["conversation", "candidate_profile", AGENT] as const) {
    await expect(ai.getAgent(agent)).toBeVisible();
    await expect(ai.getOff(agent)).toContainText("Never set up");
  }
  await expect(ai.getModelInput(AGENT)).toHaveValue("");
  await expect(ai.getPromptInput(AGENT)).toHaveValue("");
  await expect(ai.getToggle(AGENT)).toHaveAttribute("aria-pressed", "false");

  // A model the gateway couldn't accept is refused by the same rule the server
  // uses, and nothing is saved.
  await ai.getModelInput(AGENT).fill("claude-haiku-4-5");
  await ai.getPromptInput(AGENT).fill("Describe how they write.");
  await ai.getSave(AGENT).click();
  await expect(ai.getError(AGENT)).toContainText("provider, a slash");
  await expect(ai.getOff(AGENT)).toContainText("Never set up");

  // Set it up properly: switch on, a model, an instruction. Now it runs.
  await ai.getModelInput(AGENT).fill("anthropic/claude-haiku-4-5");
  await ai.getToggle(AGENT).click();
  await ai.getSave(AGENT).click();
  await expect(ai.getOff(AGENT)).toHaveCount(0);
  await expect(ai.getToggle(AGENT)).toHaveAttribute("aria-pressed", "true");

  // Off by the switch, with the fields left intact.
  await ai.getToggle(AGENT).click();
  await ai.getSave(AGENT).click();
  await expect(ai.getOff(AGENT)).toContainText("Turned off here");
  await expect(ai.getModelInput(AGENT)).toHaveValue(
    "anthropic/claude-haiku-4-5",
  );

  // Off by an empty model, with the switch left on.
  await ai.getToggle(AGENT).click();
  await ai.getModelInput(AGENT).fill("");
  await ai.getSave(AGENT).click();
  await expect(ai.getOff(AGENT)).toContainText("No model");
  await expect(ai.getToggle(AGENT)).toHaveAttribute("aria-pressed", "true");

  // Every change is in the platform trail, which is where an instruction's
  // history is kept (prd/phase-2.md §4.4).
  const trail = new AuditTrailPage(page);
  await trail.goto();
  await expect(
    trail.getEvents().filter({ hasText: "AI agent settings changed" }).first(),
  ).toBeVisible();
});
