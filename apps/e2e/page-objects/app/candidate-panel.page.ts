import type { Page } from "@playwright/test";

/**
 * The candidate panel beside a conversation: Details, Notes and History.
 * Rendered by `apps/app/src/workspace/candidate-panel.tsx`.
 */
export class CandidatePanelPage {
  constructor(public readonly page: Page) {}

  getRoot() {
    return this.page.getByTestId("candidate-panel");
  }

  getToggle() {
    return this.page.getByTestId("toggle-candidate-panel");
  }

  getTab(name: "Details" | "Notes" | "History") {
    return this.page.getByRole("tab", { name });
  }

  async openTab(name: "Details" | "Notes" | "History") {
    await this.getTab(name).click();
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

  // --- Notes ---------------------------------------------------------------

  getNotes() {
    return this.page.getByTestId("candidate-note");
  }

  getNewNoteInput() {
    return this.page.getByLabel("New note");
  }

  async addNote(body: string) {
    await this.getNewNoteInput().fill(body);
    await this.page.getByRole("button", { name: "Add note" }).click();
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
