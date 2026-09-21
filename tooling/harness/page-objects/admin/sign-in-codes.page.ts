import type { Page } from "@playwright/test";

/**
 * `apps/admin` sign-in codes (`/admin/sign-in-codes`): find an account, issue
 * a code, read it back. Rendered by `apps/admin/src/pages/sign-in-codes.tsx`.
 */
export class SignInCodesPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/sign-in-codes");
  }

  getHeading() {
    return this.page.getByRole("heading", { level: 1, name: "Sign-in codes" });
  }

  async search(text: string) {
    await this.page
      .getByTestId("sign-in-code-search")
      .getByLabel("Find an account")
      .fill(text);
  }

  getResult(email: string) {
    return this.page.getByTestId("account-result").filter({ hasText: email });
  }

  async issueFor(email: string) {
    await this.search(email);
    await this.getResult(email)
      .getByRole("button", { name: "Issue sign-in code" })
      .click();
  }

  getIssuedCode() {
    return this.page.getByTestId("issued-code");
  }

  /** The six digits of the most recently issued code. */
  async readIssuedCode(): Promise<string> {
    const text = await this.page.getByTestId("issued-code-value").textContent();
    const code = text?.trim() ?? "";
    if (!/^\d{6}$/.test(code)) throw new Error(`No code shown: "${code}"`);
    return code;
  }
}
