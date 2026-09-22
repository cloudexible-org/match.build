import type { Page } from "@playwright/test";

/**
 * `apps/admin` AI agent settings (`/admin/ai`): the three agents, each with the
 * model it runs on and its standing instruction. Rendered by
 * `apps/admin/src/pages/ai-settings.tsx`.
 */
export class AiSettingsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/ai");
  }

  getHeading() {
    return this.page.getByRole("heading", { level: 1, name: "AI agents" });
  }

  /** One agent's card, by the id the audit trail uses. */
  getAgent(agent: "conversation" | "candidate_profile" | "voice_profile") {
    return this.page.getByTestId(`agent-${agent}`);
  }

  getModelInput(agent: Parameters<AiSettingsPage["getAgent"]>[0]) {
    return this.getAgent(agent).getByLabel("Model");
  }

  getPromptInput(agent: Parameters<AiSettingsPage["getAgent"]>[0]) {
    return this.getAgent(agent).getByLabel("Standing instruction");
  }

  getSave(agent: Parameters<AiSettingsPage["getAgent"]>[0]) {
    return this.getAgent(agent).getByRole("button", { name: "Save" });
  }

  /** The On/Off switch in an agent's header. */
  getToggle(agent: Parameters<AiSettingsPage["getAgent"]>[0]) {
    return this.getAgent(agent).getByTestId(`agent-${agent}-toggle`);
  }

  /** The line saying an agent isn't running, and which of the four reasons. */
  getOff(agent: Parameters<AiSettingsPage["getAgent"]>[0]) {
    return this.getAgent(agent).getByTestId(`agent-${agent}-off`);
  }

  getError(agent: Parameters<AiSettingsPage["getAgent"]>[0]) {
    return this.getAgent(agent).getByRole("alert");
  }

  /*
   * ─── Restoring the shipped instructions ───────────────────────────────────
   *
   * Two clicks: the first asks, the second writes. It replaces all three
   * agents at once, which is why any spec driving it has to be in the file
   * that owns `aiAgentSettings` rather than one of its own.
   */

  getRestoreSeed() {
    return this.page.getByTestId("restore-seed");
  }

  /** The button that asks for confirmation. */
  getRestoreSeedStart() {
    return this.getRestoreSeed().getByTestId("restore-seed-start");
  }

  /** The button that actually writes, shown only after the first click. */
  getRestoreSeedConfirm() {
    return this.getRestoreSeed().getByTestId("restore-seed-confirm");
  }

  getRestoreSeedCancel() {
    return this.getRestoreSeed().getByRole("button", { name: "Cancel" });
  }

  /** What it reports afterwards: which agents moved, which already matched. */
  getRestoreSeedResult() {
    return this.getRestoreSeed().getByTestId("restore-seed-result");
  }

  /** Shown when AI_ENABLED isn't "true" — the state of the e2e backend. */
  getNoGatewayNotice() {
    return this.page.getByRole("heading", {
      name: "This deployment can't reach a model",
    });
  }
}
