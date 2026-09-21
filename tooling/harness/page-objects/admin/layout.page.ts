import type { Page } from "@playwright/test";

/**
 * The signed-in admin frame: the top bar and the sidebar
 * (`admin-layout.tsx`, `sidebar.tsx`).
 */
export class AdminLayout {
  constructor(public readonly page: Page) {}

  getAccountEmail() {
    return this.page.getByTestId("admin-account-email");
  }

  getSidebar() {
    return this.page.getByTestId("admin-sidebar");
  }

  /**
   * A nav link, by the name it carries in both states — collapsed, that name
   * is its `aria-label` rather than visible text.
   */
  getNavLink(
    name:
      | "Audit trail"
      | "Sign-in codes"
      | "Erasure"
      | "AI agents"
      | "AI usage",
  ) {
    return this.page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name });
  }

  getSidebarToggle() {
    return this.page.getByTestId("admin-sidebar-toggle");
  }

  getSignOutButton() {
    return this.page.getByRole("button", { name: "Sign out" });
  }
}
