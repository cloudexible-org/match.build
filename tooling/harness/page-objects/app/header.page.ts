import type { Page } from "@playwright/test";

/**
 * The top bar every signed-in page shares, rendered by
 * `apps/app/src/components/app-header.tsx`.
 *
 * It lays one set of links out twice — in a row from Tailwind's `md` up, and
 * inside a single menu below it — so this has a getter for each arrangement
 * rather than one that quietly means a different element at a different
 * width. The menu's items carry `-menu` test ids of their own, so a locator
 * never matches both copies at once.
 */
export class AppHeaderPage {
  constructor(public readonly page: Page) {}

  /** `/settings`: the account's own, wherever the width puts it. */
  getAccountSettingsLink() {
    return this.page.getByTestId("header-account-settings");
  }

  getSignOutButton() {
    return this.page.getByRole("button", { name: "Sign out" });
  }

  /** The hamburger. Only below `md`. */
  getMenuButton() {
    return this.page.getByRole("button", { name: "Menu" });
  }

  async openMenu() {
    await this.getMenuButton().click();
  }

  /** The open menu, for asserting on what it holds. */
  getMenu() {
    return this.page.getByRole("menu");
  }

  /** The signed-in account's name, which labels the menu's first group. */
  getMenuAccountName() {
    return this.page.getByTestId("header-menu-account");
  }

  /** An item of the open menu, by the words on it. */
  getMenuItem(label: string) {
    return this.getMenu().getByRole("menuitem", { name: label });
  }

  getMenuAccountSettings() {
    return this.page.getByTestId("header-account-settings-menu");
  }

  getMenuSignOut() {
    return this.page.getByTestId("header-sign-out-menu");
  }
}
