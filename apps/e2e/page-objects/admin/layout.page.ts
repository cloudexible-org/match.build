import type { Page } from "@playwright/test";

/** The signed-in admin frame: nav and account (`admin-layout.tsx`). */
export class AdminLayout {
  constructor(public readonly page: Page) {}

  getAccountEmail() {
    return this.page.getByTestId("admin-account-email");
  }

  getNavLink(name: "Audit trail" | "Sign-in codes") {
    return this.page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name });
  }

  getSignOutButton() {
    return this.page.getByRole("button", { name: "Sign out" });
  }
}
