import type { Page } from "@playwright/test";

/**
 * `apps/app` sign-in (`/app/sign-in`): an email step, then a six-digit code
 * step. Rendered by `apps/app/src/pages/sign-in.tsx`.
 *
 * Sign-in and sign-up are the same flow; a new account is then asked for its
 * name (see `CompleteProfilePage`).
 */
export class SignInPage {
  constructor(public readonly page: Page) {}

  async goto(next?: string) {
    const query = next ? `?next=${encodeURIComponent(next)}` : "";
    await this.page.goto(`/app/sign-in${query}`);
  }

  // --- Email step ----------------------------------------------------------

  getEmailForm() {
    return this.page.getByTestId("sign-in-email-form");
  }

  getEmailInput() {
    return this.page.getByLabel("Email", { exact: true });
  }

  getSendCodeButton() {
    return this.page.getByRole("button", { name: "Email me a code" });
  }

  async requestCode(email: string) {
    await this.getEmailInput().fill(email);
    await this.getSendCodeButton().click();
  }

  getHaveCodeButton() {
    return this.page.getByRole("button", { name: "I already have a code" });
  }

  /**
   * Goes to the code step without sending one — for a code issued by a
   * platform admin, which a "send" would replace.
   */
  async useExistingCode(email: string) {
    await this.getEmailInput().fill(email);
    await this.getHaveCodeButton().click();
  }

  // --- Code step -----------------------------------------------------------

  getCodeForm() {
    return this.page.getByTestId("sign-in-code-form");
  }

  /**
   * The first slot; it carries the field's label. By role, because the slot
   * group is labelled with the same name.
   */
  getCodeInput() {
    return this.page.getByRole("textbox", {
      name: "Sign-in code",
      exact: true,
    });
  }

  /**
   * "We sent a 6-digit code to …" — names the address the code went to. After
   * "I already have a code" it reads "…code for …" instead.
   */
  getCodeSentTo(email: string) {
    return this.page.getByText(`code to ${email}`);
  }

  /**
   * Types the code into the slots. Completing the last slot submits on its
   * own, as it does for a person.
   */
  async enterCode(code: string) {
    await this.getCodeInput().click();
    await this.page.keyboard.type(code);
  }

  getSendNewCodeButton() {
    return this.page.getByRole("button", { name: "Send a new code" });
  }

  getUseDifferentEmailButton() {
    return this.page.getByRole("button", { name: "Use a different email" });
  }

  /** Any validation or server error shown under the active field. */
  getError(text: string | RegExp) {
    return this.page.getByText(text);
  }
}

/** The name step shown to a brand-new account after its first sign-in. */
export class CompleteProfilePage {
  constructor(public readonly page: Page) {}

  getForm() {
    return this.page.getByTestId("complete-profile-form");
  }

  getNameInput() {
    return this.page.getByLabel("Your name");
  }

  async submitName(name: string) {
    await this.getNameInput().fill(name);
    await this.page.getByRole("button", { name: "Continue" }).click();
  }
}
