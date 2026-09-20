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

  getComposer() {
    return this.page.getByTestId("composer");
  }

  /** Types a message and sends it. */
  async send(body: string) {
    await this.getMessageInput().fill(body);
    await this.page.getByRole("button", { name: /^Send/ }).click();
    await expect(this.getMessageInput()).toHaveValue("");
  }

  getMenuButton() {
    return this.page.getByTestId("candidate-chat-menu");
  }

  /** Opens the menu and returns its "Leave <matchmaker>" item. */
  async openLeave() {
    await this.getMenuButton().click();
    const item = this.page.getByRole("menuitem", { name: /^Leave / });
    await expect(item).toBeVisible();
    return item;
  }

  /** The confirmation panel, once "Leave …" has been chosen. */
  getLeaveConfirmation() {
    return this.page.getByTestId("leave-confirmation");
  }

  getLeaveReasonInput() {
    return this.getLeaveConfirmation().getByLabel("Reason (optional)");
  }

  getConfirmLeaveButton() {
    return this.getLeaveConfirmation().getByRole("button", {
      name: /^Leave |^Leaving/,
    });
  }

  getStayButton() {
    return this.getLeaveConfirmation().getByRole("button", { name: "Stay" });
  }

  /** Opens the menu, confirms leaving, optionally with a reason. */
  async leave(reason?: string) {
    await (await this.openLeave()).click();
    await expect(this.getLeaveConfirmation()).toBeVisible();
    if (reason !== undefined) await this.getLeaveReasonInput().fill(reason);
    await this.getConfirmLeaveButton().click();
  }
}
