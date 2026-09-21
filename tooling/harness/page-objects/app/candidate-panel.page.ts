import type { Locator, Page } from "@playwright/test";

/**
 * The candidate panel beside a conversation: Details, Profile and History.
 * Rendered by `apps/app/src/workspace/candidate-panel.tsx` and
 * `candidate-profile.tsx`.
 */
export class CandidatePanelPage {
  constructor(public readonly page: Page) {}

  getRoot() {
    return this.page.getByTestId("candidate-panel");
  }

  getToggle() {
    return this.page.getByTestId("toggle-candidate-panel");
  }

  /** The panel's scroller: the sections, below its header. */
  getScroll() {
    return this.page.getByTestId("candidate-panel-scroll");
  }

  /**
   * Each section's header button. By test id, not by name: "Profile" also
   * labels a filter inside the History section.
   */
  getSection(name: "Matches" | "Details" | "Profile" | "History") {
    return this.page.getByTestId(`accordion-${name.toLowerCase()}`);
  }

  /** Expands a section, unless it is already open. */
  async openSection(name: "Matches" | "Details" | "Profile" | "History") {
    const header = this.getSection(name);
    if ((await header.getAttribute("aria-expanded")) !== "true") {
      await header.click();
    }
  }

  // --- Details -------------------------------------------------------------

  getNameInput() {
    return this.page.getByTestId("candidate-details-form").getByLabel("Name");
  }

  getSaveDetailsButton() {
    return this.page.getByRole("button", { name: "Save details" });
  }

  getDetailsStatus() {
    return this.page.getByTestId("candidate-details-status");
  }

  getEmail() {
    return this.page.getByTestId("candidate-email");
  }

  getMembership() {
    return this.page.getByTestId("candidate-membership");
  }

  getStatusSelect() {
    return this.page.getByTestId("candidate-status");
  }

  // --- Profile: structured facts -------------------------------------------

  getProfile() {
    return this.page.getByTestId("candidate-profile");
  }

  /** Every field that has a value; the panel renders no empty ones. */
  getFields() {
    return this.page.getByTestId("profile-field");
  }

  getField(key: string) {
    return this.page.locator(
      `[data-testid="profile-field"][data-field="${key}"]`,
    );
  }

  /** The add-a-field form's own value control, whatever kind it is. */
  getAddFieldValue() {
    return this.page
      .getByTestId("profile-add-field-form")
      .getByTestId("profile-value");
  }

  async addField(key: string, value: string) {
    await this.page.getByTestId("profile-add-field").selectOption(key);
    await this.fillValue(this.getAddFieldValue(), value);
    await this.page.getByRole("button", { name: "Add", exact: true }).click();
  }

  /**
   * The registry decides what control a field gets — a select, a date box or a
   * text box — so the page object asks the element rather than the field.
   */
  private async fillValue(control: Locator, value: string) {
    const tag = await control.evaluate((node) => node.tagName);
    if (tag === "SELECT") await control.selectOption(value);
    else await control.fill(value);
  }

  async editField(key: string, value: string) {
    const row = this.getField(key);
    await row.getByRole("button", { name: "Edit" }).click();
    await this.fillValue(row.getByTestId("profile-value"), value);
    await row.getByRole("button", { name: "Save" }).click();
  }

  async clearField(key: string) {
    await this.getField(key).getByRole("button", { name: "Clear" }).click();
  }

  // --- Profile: free-text notes --------------------------------------------

  getNotes() {
    return this.page.getByTestId("profile-note");
  }

  getNote(key: string) {
    return this.page.locator(
      `[data-testid="profile-note"][data-note="${key}"]`,
    );
  }

  async addNote(key: string, body: string) {
    await this.page.getByTestId("profile-add-note-key").selectOption(key);
    await this.page.getByTestId("profile-add-note-body").fill(body);
    await this.page.getByRole("button", { name: "Add note" }).click();
  }

  async editNote(key: string, body: string) {
    const row = this.getNote(key);
    await row.getByRole("button", { name: "Edit" }).click();
    await row.getByTestId("profile-note-body").fill(body);
    await row.getByRole("button", { name: "Save" }).click();
  }

  async removeNote(key: string) {
    await this.getNote(key).getByRole("button", { name: "Remove" }).click();
  }

  // --- Matches (prd/phase-3.md §2) --------------------------------------

  getMatches() {
    return this.page.getByTestId("candidate-matches");
  }

  /** The one card showing, which is the board's card verbatim. */
  getMatchCard() {
    return this.getMatches().getByTestId("match-card");
  }

  /** The stage badge — what the board says by which column a card is in. */
  getMatchStage() {
    return this.page.getByTestId("candidate-match-stage");
  }

  getMatchCounter() {
    return this.getMatches().getByTestId("carousel-counter");
  }

  async nextMatch() {
    await this.getMatches().getByTestId("carousel-next").click();
  }

  async previousMatch() {
    await this.getMatches().getByTestId("carousel-previous").click();
  }

  // --- History -------------------------------------------------------------

  getHistoryEntries() {
    return this.page.getByTestId("history-entry");
  }

  getHistoryFilter(label: string) {
    return this.page
      .getByTestId("candidate-history")
      .getByRole("button", { name: label });
  }
}
