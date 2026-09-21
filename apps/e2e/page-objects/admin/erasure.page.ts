import type { Page } from "@playwright/test";

/**
 * `apps/admin` erasure requests (`/admin/erasure`): find an account, confirm
 * by typing its address, erase it. Rendered by
 * `apps/admin/src/pages/erasure.tsx`.
 */
export class ErasurePage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/erasure");
  }

  getHeading() {
    return this.page.getByRole("heading", {
      level: 1,
      name: "Erasure requests",
    });
  }

  async search(text: string) {
    await this.page
      .getByTestId("erasure-search")
      .getByLabel("Find the account")
      .fill(text);
  }

  getResult(email: string) {
    return this.page.getByTestId("account-result").filter({ hasText: email });
  }

  /** Picks an account, which opens the confirmation. */
  async choose(email: string) {
    await this.search(email);
    await this.getResult(email).getByRole("button", { name: "Erase…" }).click();
  }

  getConfirm() {
    return this.page.getByTestId("erasure-confirm");
  }

  getConfirmInput() {
    return this.page.getByTestId("erasure-confirm-email");
  }

  getConfirmButton() {
    return this.page.getByTestId("erasure-confirm-submit");
  }

  /** Types `typed` back and submits. Pass a wrong value to test the guard. */
  async confirm(typed: string) {
    await this.getConfirmInput().fill(typed);
    await this.getConfirmButton().click();
  }

  getDone() {
    return this.page.getByTestId("erasure-done");
  }

  getError(text: string | RegExp) {
    return this.page.getByText(text);
  }
}
