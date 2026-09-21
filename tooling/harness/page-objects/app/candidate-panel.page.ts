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

  /** The header's Details button — below `lg` only, where the panel hides. */
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

  /**
   * One row of the Details record, by what it holds: `name`, `email`,
   * `acceptedAs`, `membership` or `status`. The same locator finds the row
   * whether it is reading or being edited.
   */
  getDetail(field: "name" | "email" | "acceptedAs" | "membership" | "status") {
    return this.page.locator(
      `[data-testid="candidate-detail"][data-field="${field}"]`,
    );
  }

  getNameRow() {
    return this.getDetail("name");
  }

  /** Opens the name row's editor, unless it is already open. */
  async openName() {
    const input = this.getNameInput();
    if (!(await input.isVisible())) {
      await this.getNameRow().getByRole("button", { name: "Edit" }).click();
    }
    return input;
  }

  getNameInput() {
    return this.page.getByTestId("candidate-name-form").getByLabel("Name");
  }

  async setName(value: string) {
    await this.openName();
    await this.getNameInput().fill(value);
    await this.getNameRow().getByRole("button", { name: "Save" }).click();
  }

  getEmail() {
    return this.page.getByTestId("candidate-email");
  }

  getMembership() {
    return this.page.getByTestId("candidate-membership");
  }

  /** Every social handle on the record, in the order the panel lists them. */
  getHandles() {
    return this.page.getByTestId("details-handle");
  }

  getHandle(platform: string) {
    return this.page.locator(
      `[data-testid="details-handle"][data-field="${platform}"]`,
    );
  }

  /** Unfolds the add-a-handle form, which is a button until you reach for it. */
  async openAddHandle() {
    const form = this.page.getByTestId("details-add-handle-form");
    if (!(await form.isVisible())) {
      await this.page.getByTestId("details-add-handle-open").click();
    }
    return form;
  }

  /** `platform` is the label the select shows, e.g. "WhatsApp". */
  async addHandle(platform: string, handle: string) {
    const form = await this.openAddHandle();
    await form.getByLabel("Platform").selectOption({ label: platform });
    await form.getByLabel("Handle").fill(handle);
    await form.getByRole("button", { name: "Add", exact: true }).click();
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

  /**
   * Unfolds the add-a-field form. It is a button until you reach for it, so
   * the panel reads as a record rather than ending in an empty form.
   */
  async openAddField() {
    const form = this.page.getByTestId("profile-add-field-form");
    if (!(await form.isVisible())) {
      await this.page.getByTestId("profile-add-field-open").click();
    }
    return form;
  }

  async addField(key: string, value: string) {
    await this.openAddField();
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

  /**
   * Clearing lives inside the row's edit form: the read row is one line with
   * no room for a pair of buttons, and emptying a field is worth the extra
   * click anyway.
   */
  async clearField(key: string) {
    const row = this.getField(key);
    await row.getByRole("button", { name: "Edit" }).click();
    await row.getByRole("button", { name: "Clear" }).click();
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

  /** Unfolds the add-a-note form, which is a button until you reach for it. */
  async openAddNote() {
    const form = this.page.getByTestId("profile-add-note-form");
    if (!(await form.isVisible())) {
      await this.page.getByTestId("profile-add-note-open").click();
    }
    return form;
  }

  async addNote(key: string, body: string) {
    await this.openAddNote();
    await this.page.getByTestId("profile-add-note-key").selectOption(key);
    await this.page.getByTestId("profile-add-note-body").fill(body);
    await this.page.getByRole("button", { name: "Add note" }).click();
  }

  /**
   * A note under a name of the matchmaker's own, typed rather than picked.
   *
   * The name goes in as free text and leaves the field as a key — "Ideal
   * Weekend" becomes `ideal_weekend` — so this blurs the field the way a
   * person would before reading the result back.
   */
  async addCustomNote(name: string, body: string) {
    await this.openAddNote();
    await this.page
      .getByTestId("profile-add-note-key")
      .selectOption("__custom");
    const key = this.page.getByTestId("profile-add-note-custom-key");
    await key.fill(name);
    await key.blur();
    await this.page.getByTestId("profile-add-note-body").fill(body);
    await this.page.getByRole("button", { name: "Add note" }).click();
  }

  /** The name field on the add-a-note form, for asserting what it shows back. */
  getCustomNoteKey() {
    return this.page.getByTestId("profile-add-note-custom-key");
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
