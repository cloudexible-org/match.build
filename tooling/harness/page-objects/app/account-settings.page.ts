import type { Page } from "@playwright/test";

/**
 * `/app/settings`: the account's own settings — its name, and deleting it
 * (prd/phase-1.md §3.5). Rendered by
 * `apps/app/src/pages/account-settings.tsx`.
 */
export class AccountSettingsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/app/settings");
  }

  getHeading() {
    return this.page.getByRole("heading", {
      level: 1,
      name: "Account settings",
    });
  }

  getNameForm() {
    return this.page.getByTestId("account-name-form");
  }

  getEmail() {
    return this.page.getByTestId("account-email");
  }

  getNameInput() {
    return this.getNameForm().getByLabel("Your name");
  }

  getSaveButton() {
    return this.getNameForm().getByRole("button", { name: "Save changes" });
  }

  getSaveStatus() {
    return this.page.getByTestId("account-name-status");
  }

  /** The Delete account card, whatever step it is on. */
  getDeleteCard() {
    return this.page.getByTestId("delete-account");
  }

  getDeleteStartButton() {
    return this.page.getByTestId("delete-account-start");
  }

  getDeleteForm() {
    return this.page.getByTestId("delete-account-form");
  }

  /**
   * The code field's first slot, which carries the field's label. By role,
   * because the slot group is labelled with the same name (see
   * `sign-in.page.ts`).
   */
  getCodeInput() {
    return this.getDeleteForm().getByRole("textbox", {
      name: "Confirmation code",
      exact: true,
    });
  }

  /** Types the code into the slots, as a person does. */
  async enterCode(code: string) {
    await this.getCodeInput().click();
    await this.page.keyboard.type(code);
  }

  getConfirmDeleteButton() {
    return this.getDeleteForm().getByRole("button", {
      name: /Delete my account|Deleting/,
    });
  }

  getCancelDeleteButton() {
    return this.getDeleteForm().getByRole("button", { name: "Cancel" });
  }

  getNewCodeButton() {
    return this.getDeleteForm().getByRole("button", {
      name: "Send a new code",
    });
  }

  getError(text: string | RegExp) {
    return this.getDeleteCard().getByText(text);
  }

  /**
   * Types the code in. Completing the last slot submits on its own, as it
   * does for a person, so there is no button to press afterwards.
   */
  async confirmDeletion(code: string) {
    await this.enterCode(code);
  }
}
