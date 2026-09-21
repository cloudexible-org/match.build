import type { Page } from "@playwright/test";

/**
 * The notifications overlay under the bell in the header.
 * Rendered by `apps/app/src/notifications/notifications-menu.tsx`.
 *
 * There is no spec against this yet: the list is still a fixed sample
 * (`use-notifications.ts`), so nothing a test does can change it. The
 * selectors are here because the wiring is what makes it assertable, and
 * they are the contract that wiring has to keep.
 */
export class NotificationsPage {
  constructor(public readonly page: Page) {}

  getTrigger() {
    return this.page.getByTestId("notifications-trigger");
  }

  /** The unread count on the bell. Absent when there is nothing unread. */
  getBadge() {
    return this.page.getByTestId("notifications-badge");
  }

  async open() {
    if ((await this.getTrigger().getAttribute("aria-expanded")) !== "true") {
      await this.getTrigger().click();
    }
  }

  getPanel() {
    return this.page.getByRole("dialog", { name: "Notifications" });
  }

  getItems() {
    return this.page.getByTestId("notification");
  }

  /** Only the ones still unread — what the dot and the count are about. */
  getUnreadItems() {
    return this.page
      .getByTestId("notification")
      .and(this.page.locator('[data-read="false"]'));
  }

  getEmptyState() {
    return this.page.getByTestId("notifications-empty");
  }
}
