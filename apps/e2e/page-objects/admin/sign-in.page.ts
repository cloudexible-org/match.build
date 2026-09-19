import type { Page } from "@playwright/test";

/**
 * `apps/admin` sign-in (`/admin/sign-in`): email, then the emailed six-digit
 * code. Rendered by `apps/admin/src/pages/sign-in.tsx`, which shares its test
 * ids and labels with the app's sign-in page.
 */
export class AdminSignInPage {
  constructor(public readonly page: Page) {}

  async goto(next?: string) {
    const query = next ? `?next=${encodeURIComponent(next)}` : "";
    await this.page.goto(`/admin/sign-in${query}`);
  }

  getEmailForm() {
    return this.page.getByTestId("sign-in-email-form");
  }

  getEmailInput() {
    return this.page.getByLabel("Email", { exact: true });
  }

  async requestCode(email: string) {
    await this.getEmailInput().fill(email);
    await this.page.getByRole("button", { name: "Email me a code" }).click();
  }

  getCodeForm() {
    return this.page.getByTestId("sign-in-code-form");
  }

  /** Types the code; completing the last slot submits. */
  async enterCode(code: string) {
    await this.page
      .getByRole("textbox", { name: "Sign-in code", exact: true })
      .click();
    await this.page.keyboard.type(code);
  }

  getError(text: string | RegExp) {
    return this.page.getByText(text);
  }
}

/** Shown to a signed-in account that isn't in PLATFORM_ADMIN_EMAILS. */
export class NotAnAdminPage {
  constructor(public readonly page: Page) {}

  get() {
    return this.page.getByTestId("not-an-admin");
  }

  getSignOutButton() {
    return this.page.getByRole("button", { name: "Sign out" });
  }
}
