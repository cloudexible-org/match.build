import { expect, type Page } from "@playwright/test";

/**
 * `/app/c`: the candidate shell. The matchmakers this account belongs to in
 * the first column, the conversation with the one the hash names
 * (`/app/c#maya.matches`) in the second, and what that membership lets them
 * do in the third. Rendered by `apps/app/src/pages/candidate.tsx`.
 */
export class CandidateShellPage {
  constructor(public readonly page: Page) {}

  /** Opens the shell, optionally straight at one matchmaker. */
  async goto(matchmakerUsername?: string) {
    await this.page.goto(
      matchmakerUsername === undefined
        ? "/app/c"
        : `/app/c#${matchmakerUsername}`,
    );
  }

  getRoot() {
    return this.page.getByTestId("candidate-shell");
  }

  getMatchmakerList() {
    return this.page.getByTestId("candidate-matchmakers");
  }

  /** The list column's scroller, between its heading and its footer. */
  getMatchmakerListScroll() {
    return this.page.getByTestId("candidate-matchmakers-scroll");
  }

  /** A matchmaker's row in the first column, by any text it contains. */
  getMatchmakerRow(text: string) {
    return this.getMatchmakerList()
      .getByRole("listitem")
      .filter({ hasText: text });
  }

  /** The invitation cards above the list, each with its "Invited" badge. */
  getInvitationsSection() {
    return this.page.getByTestId("candidate-invitations");
  }

  getInvitation(text: string) {
    return this.page
      .getByTestId("candidate-invitation")
      .filter({ hasText: text });
  }

  /** Shown only to an account with no matchmaker profile of its own. */
  getCreateMatchmakerLink() {
    return this.page.getByTestId("candidate-create-matchmaker");
  }

  /** Shown instead, to an account that owns one. */
  getOwnWorkspaceLink() {
    return this.page.getByTestId("candidate-own-workspace");
  }

  /** The centre column when this account has no conversation to open. */
  getNoConversations() {
    return this.page.getByText("No conversations yet");
  }
}

/**
 * The conversation and panel inside the shell: the second and third columns
 * of `apps/app/src/pages/candidate.tsx`.
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

  /** The middle column's scroller: the messages, above the composer. */
  getThread() {
    return this.page.getByTestId("conversation-messages");
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

  /** The header's Details button — below `lg` only, where the panel hides. */
  getPanelToggle() {
    return this.page.getByTestId("toggle-matchmaker-panel");
  }

  getPanel() {
    return this.page.getByTestId("matchmaker-panel");
  }

  /** The panel's scroller, below its header. */
  getPanelScroll() {
    return this.page.getByTestId("matchmaker-panel-scroll");
  }

  getPanelMembership() {
    return this.page.getByTestId("matchmaker-panel-membership");
  }

  getNotificationSettingsLink() {
    return this.page.getByTestId("matchmaker-panel-notifications");
  }

  getLeaveButton() {
    return this.page.getByTestId("matchmaker-panel-leave");
  }

  /**
   * Opens the panel where it's collapsed (below `lg`) and returns its
   * "Leave <matchmaker>" button.
   *
   * The chat has to be on screen before the panel's state can be read at
   * all: on a page that is still loading, *nothing* is visible, and
   * "the Leave button isn't there yet" is not the same answer as "the panel
   * is closed".
   */
  async openLeave() {
    await expect(this.getRoot()).toBeVisible();
    // From `lg` up there is no Details button: the panel is already beside
    // the thread, so there is nothing to press.
    const toggle = this.getPanelToggle();
    if ((await toggle.isVisible()) && !(await this.getPanel().isVisible())) {
      await toggle.click();
    }
    const button = this.getLeaveButton();
    await expect(button).toBeVisible();
    return button;
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

  /** Opens the panel, confirms leaving, optionally with a reason. */
  async leave(reason?: string) {
    await (await this.openLeave()).click();
    await expect(this.getLeaveConfirmation()).toBeVisible();
    if (reason !== undefined) await this.getLeaveReasonInput().fill(reason);
    await this.getConfirmLeaveButton().click();
  }

  /** Shown when the hash names a matchmaker this account can't open. */
  getNotFound() {
    return this.page.getByRole("heading", { name: "Page not found" });
  }
}

/**
 * `/app/c/mm/discover`: a shell for phase 3's directory. Nothing in the UI
 * links here in v1 — joining is by invitation only — so it is only reached
 * by typing it. Rendered by `apps/app/src/pages/discover.tsx`.
 */
export class DiscoverPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/app/c/mm/discover");
  }

  getTitle() {
    return this.page.getByRole("heading", { name: "Find a matchmaker" });
  }

  getEmptyState() {
    return this.page.getByTestId("discover-empty");
  }
}
