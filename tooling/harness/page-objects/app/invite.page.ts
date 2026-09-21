import type { Page } from "@playwright/test";

/**
 * The accept screen: `/app/invite/:token` and `/app/invitations/:id`.
 * Rendered by `apps/app/src/pages/invite.tsx`.
 */
export class InvitePage {
  constructor(public readonly page: Page) {}

  getCard() {
    return this.page.getByTestId("invite-card");
  }

  getTitle() {
    return this.getCard()
      .getByText(/invited you to match\.build|isn't valid|declined/)
      .first();
  }

  getPrivacyNotice() {
    return this.page.getByTestId("invite-privacy-notice");
  }

  getAcceptButton() {
    return this.page.getByRole("button", { name: "Accept" });
  }

  getDeclineButton() {
    return this.page.getByRole("button", { name: "Decline" });
  }

  getAlert() {
    return this.getCard().getByRole("alert");
  }

  getInvalid() {
    return this.page.getByText("This invitation isn't valid any more");
  }

  getDeclined() {
    return this.page.getByText("Invitation declined");
  }
}
