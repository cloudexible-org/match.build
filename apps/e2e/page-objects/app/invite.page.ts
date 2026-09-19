import { expect, type Page } from "@playwright/test";

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
      .getByText(/invited you to Matchmaker|isn't valid|declined/)
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

/**
 * `/app/c/:matchmakerUsername`: a candidate's chat with one matchmaker.
 * Rendered by `apps/app/src/pages/candidate-chat.tsx`.
 */
export class CandidateChatPage {
  constructor(public readonly page: Page) {}

  getRoot() {
    return this.page.getByTestId("candidate-chat");
  }

  getMatchmakerName() {
    return this.page.getByTestId("candidate-chat-matchmaker");
  }

  getMessages() {
    return this.page.getByTestId("conversation-message");
  }

  getMessageInput() {
    return this.page.getByLabel("Message", { exact: true });
  }

  /** Types a message and sends it. */
  async send(body: string) {
    await this.getMessageInput().fill(body);
    await this.page.getByRole("button", { name: /^Send/ }).click();
    await expect(this.getMessageInput()).toHaveValue("");
  }
}
