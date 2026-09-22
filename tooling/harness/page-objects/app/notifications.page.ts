import { expect, type Page } from "@playwright/test";

/**
 * The notifications overlay under the bell in the header.
 * Rendered by `apps/app/src/notifications/notifications-menu.tsx`, from
 * `convex/notifications/queries.ts:feed`.
 */
export class NotificationsPage {
  constructor(public readonly page: Page) {}

  getTrigger() {
    return this.page.getByTestId("notifications-trigger");
  }

  /** The unread count on the bell. Absent when there is nothing new. */
  getBadge() {
    return this.page.getByTestId("notifications-badge");
  }

  /**
   * Opens the panel, unless it is already open, and waits for the feed behind
   * it to have arrived. By whether the panel is showing rather than by the
   * trigger's state: clicking a second time would close it again.
   *
   * The wait is the point. The bell can be clicked before the feed query has
   * resolved, and the panel then holds rather than marking an empty list read
   * (`notifications-menu.tsx`) — so the dots, the quiet bell and "you're all
   * caught up" are all only true of this opening once the list is there.
   */
  async open() {
    if (!(await this.getPanel().isVisible())) {
      await this.getTrigger().click();
      await expect(this.getPanel()).toBeVisible();
    }
    await expect(this.getLoading()).toHaveCount(0);
  }

  getPanel() {
    return this.page.getByTestId("notifications-panel");
  }

  getItems() {
    return this.page.getByTestId("notification");
  }

  /** One item, by any text it contains — a name, or what happened. */
  getItem(text: string) {
    return this.getItems().filter({ hasText: text });
  }

  /**
   * The ones the panel marks as new. Opening it clears unread, so this is
   * what was unread *as it opened* — the dots, not the badge.
   */
  getNewItems() {
    return this.getItems().and(this.page.locator('[data-unread="true"]'));
  }

  getEmptyState() {
    return this.page.getByTestId("notifications-empty");
  }

  /** Shown in place of the list while the feed is still loading. */
  getLoading() {
    return this.page.getByTestId("notifications-loading");
  }
}
