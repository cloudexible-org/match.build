import { expect, test } from "@playwright/test";
import { signInToAdmin } from "@repo/harness/accounts";
import { AiSettingsPage } from "@repo/harness/page-objects/admin/ai-settings.page";
import { AuditTrailPage } from "@repo/harness/page-objects/admin/audit-trail.page";
import { AdminLayout } from "@repo/harness/page-objects/admin/layout.page";
import { SEED_ADMINS } from "@repo/harness/seed";

/**
 * An admin sets up an agent from nothing, turns it off with the switch, and
 * turns it off again by clearing the model — the three states prd/phase-2.md
 * §4.4 cares about — and the trail records each change.
 *
 * `aiAgentSettings` is global by design, so unlike most specs this one cannot
 * seed its own private copy: there is one row per agent for the whole
 * deployment. **This file owns that table.** The first test confines itself to
 * the `voice_profile` agent; the second drives the restore button, which
 * replaces all three at once and so could not live in a file of its own —
 * files run in parallel across workers (`fullyParallel: false` makes a file's
 * tests serial, not the files themselves), and it would clobber the first test
 * mid-run. Anything else that writes these settings belongs here too, after
 * the restore, or it is racing.
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

/**
 * Restoring the shipped instructions (`admin/mutations:resetAiAgentsToSeed`).
 *
 * Runs second on purpose: it reads whatever the test above left behind — an
 * agent someone has edited — which is the state the button exists for.
 */
test("an admin restores the shipped instructions, and the trail keeps what was replaced", async ({
  page,
}) => {
  if (!admin) throw new Error("No seed admin 'admin-ai'");
  await signInToAdmin(page, admin.email);

  // Through the nav rather than `ai.goto()`: a hard navigation straight after
  // signing in races the redirect and lands back on the sign-in page.
  await new AdminLayout(page).getNavLink("AI agents").click();
  const ai = new AiSettingsPage(page);
  await expect(ai.getHeading()).toBeVisible();

  // Asking is not doing. The first click only offers the confirmation, and
  // cancelling leaves the edited agent exactly as the previous test left it.
  await ai.getRestoreSeedStart().click();
  await expect(ai.getRestoreSeedConfirm()).toBeVisible();
  await ai.getRestoreSeedCancel().click();
  await expect(ai.getRestoreSeedConfirm()).toHaveCount(0);
  await expect(ai.getModelInput(AGENT)).toHaveValue("");

  // The second click writes. Every agent was either unconfigured or edited, so
  // all three move.
  await ai.getRestoreSeedStart().click();
  await ai.getRestoreSeedConfirm().click();
  await expect(ai.getRestoreSeedResult()).toContainText("Restored");

  // The page follows the write through the subscription: all three now carry a
  // model and an instruction, and none says it was never set up.
  for (const agent of ["conversation", "candidate_profile", AGENT] as const) {
    await expect(ai.getModelInput(agent)).not.toHaveValue("");
    await expect(ai.getPromptInput(agent)).not.toHaveValue("");
    await expect(ai.getOff(agent)).toHaveCount(0);
  }

  // Idempotent: a second run finds nothing to do and says so rather than
  // writing three more events.
  await ai.getRestoreSeedStart().click();
  await ai.getRestoreSeedConfirm().click();
  await expect(ai.getRestoreSeedResult()).toContainText("already match");

  // The replaced instructions are in the trail, which is the only way back to
  // one — the page has no undo and says as much.
  const trail = new AuditTrailPage(page);
  await trail.goto();
  await expect(
    trail.getEvents().filter({ hasText: "AI agent settings changed" }).first(),
  ).toBeVisible();
});
