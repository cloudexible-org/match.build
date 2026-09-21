import type { Page } from "@playwright/test";

/**
 * `apps/admin` AI usage (`/admin/usage`): what the agents have spent, by day,
 * agent, model and matchmaker, and the rate each model is priced at. Rendered by
 * `apps/admin/src/pages/ai-usage.tsx`.
 */
export class AiUsagePage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/usage");
  }

  getHeading() {
    return this.page.getByRole("heading", { level: 1, name: "AI usage" });
  }

  /** One of the window buttons, by how many days it covers. */
  getWindow(days: 1 | 7 | 30) {
    return this.page.getByTestId(`usage-window-${days}`);
  }

  /** A summary tile, by its label. */
  getTile(label: "generations" | "input-tokens" | "output-tokens" | "cost") {
    return this.page.getByTestId(`usage-tile-${label}`);
  }

  getByAgent() {
    return this.page.getByTestId("usage-by-agent");
  }

  getByMatchmaker() {
    return this.page.getByTestId("usage-by-matchmaker");
  }

  getByDay() {
    return this.page.getByTestId("usage-by-day");
  }

  getDayRows() {
    return this.page.getByTestId("usage-by-day-row");
  }

  /** One model's card, by the id the gateway names it with. */
  getModel(model: string) {
    return this.page.getByTestId(`usage-model-${model}`);
  }

  /** What that model's generations came to in this window. */
  getModelCost(model: string) {
    return this.page.getByTestId(`usage-model-${model}-cost`);
  }

  /**
   * One of a model's three rate fields. Exact, because "Input $/M" is a
   * substring of "Cached input $/M" and a loose match resolves to both.
   */
  getRateInput(model: string, which: "Input" | "Output" | "Cached input") {
    return this.getModel(model).getByLabel(
      which === "Cached input" ? /^Cached input/ : `${which} $/M`,
      { exact: which !== "Cached input" },
    );
  }

  getRateSave(model: string) {
    return this.getModel(model).getByRole("button", { name: "Save" });
  }

  getRateError(model: string) {
    return this.getModel(model).getByRole("alert");
  }

  /** A row in one of the totals tables, by the text in its first cell. */
  getRow(table: "usage-by-agent" | "usage-by-matchmaker", text: string) {
    return this.page
      .getByTestId(table)
      .getByRole("row")
      .filter({ hasText: text });
  }
}
