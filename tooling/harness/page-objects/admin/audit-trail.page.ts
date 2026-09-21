import type { Page } from "@playwright/test";

/**
 * `apps/admin` audit trail (`/admin/audit`): filters, then one table row per
 * event. Rendered by `apps/admin/src/pages/audit-trail.tsx`.
 */
export class AuditTrailPage {
  constructor(public readonly page: Page) {}

  async goto(query = "") {
    await this.page.goto(`/admin/audit${query}`);
  }

  getHeading() {
    return this.page.getByRole("heading", { level: 1, name: "Audit trail" });
  }

  private filters() {
    return this.page.getByTestId("audit-filters");
  }

  getMatchmakerSelect() {
    return this.filters().getByLabel("Matchmaker");
  }

  getCandidateSelect() {
    return this.filters().getByLabel("Candidate");
  }

  getActionSelect() {
    return this.filters().getByLabel("Action");
  }

  /** Picks a matchmaker by its option text, e.g. "Name (@username)". */
  async filterByMatchmaker(username: string) {
    const select = this.getMatchmakerSelect();
    const option = select.locator("option", { hasText: `(@${username})` });
    await select.selectOption((await option.getAttribute("value")) ?? "");
  }

  async filterByAction(label: string) {
    await this.getActionSelect().selectOption({ label });
  }

  /** Opens "Filter by the account that acted" and picks the account. */
  async filterByAccount(email: string) {
    await this.filters().getByText("Filter by the account that acted").click();
    const search = this.page.getByTestId("audit-account-search");
    await search.getByLabel("Account").fill(email);
    await search
      .getByTestId("account-result")
      .filter({ hasText: email })
      .getByRole("button", { name: "Filter" })
      .click();
  }

  getAccountFilter() {
    return this.page.getByTestId("audit-account-filter");
  }

  getClearFiltersButton() {
    return this.page.getByRole("button", { name: "Clear all filters" });
  }

  getEvents() {
    return this.page.getByTestId("audit-event");
  }

  getEmpty() {
    return this.page.getByTestId("audit-empty");
  }
}
