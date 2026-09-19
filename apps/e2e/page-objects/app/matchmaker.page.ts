import type { Page } from "@playwright/test";

/**
 * `/app/mm/new`: create a matchmaker profile. Rendered by
 * `apps/app/src/pages/create-matchmaker.tsx`.
 */
export class CreateMatchmakerPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/app/mm/new");
  }

  getForm() {
    return this.page.getByTestId("create-matchmaker-form");
  }

  getUsernameInput() {
    return this.page.getByLabel("Username");
  }

  getDisplayNameInput() {
    return this.page.getByLabel("Display name");
  }

  getBusinessNameInput() {
    return this.page.getByLabel("Business name (optional)");
  }

  getSubmitButton() {
    return this.page.getByRole("button", { name: "Create profile" });
  }

  async create(profile: {
    username: string;
    displayName: string;
    businessName?: string;
  }) {
    await this.getUsernameInput().fill(profile.username);
    await this.getDisplayNameInput().fill(profile.displayName);
    await this.getBusinessNameInput().fill(profile.businessName ?? "");
    await this.getSubmitButton().click();
  }

  /** A validation or server error, by its text. */
  getError(text: string | RegExp) {
    return this.getForm().getByText(text);
  }
}

/**
 * `/app/mm/:username`: the matchmaker workspace, and the header it shares
 * with the profile's settings. Rendered by `apps/app/src/pages/workspace.tsx`
 * inside `apps/app/src/workspace/workspace-layout.tsx`.
 */
export class WorkspacePage {
  constructor(public readonly page: Page) {}

  async goto(username: string) {
    await this.page.goto(`/app/mm/${username}`);
  }

  getRoot() {
    return this.page.getByTestId("workspace");
  }

  /** The profile's display name in the header; links to the workspace. */
  getName() {
    return this.page.getByTestId("workspace-name");
  }

  getCandidates() {
    return this.page.getByTestId("workspace-candidates");
  }

  getConversation() {
    return this.page.getByTestId("workspace-conversation");
  }

  getSettingsLink() {
    return this.page.getByRole("link", { name: "Settings" });
  }

  getNotFound() {
    return this.page.getByRole("heading", { name: "Page not found" });
  }
}

/**
 * `/app/mm/:username/settings`: display name, business name and the
 * profile's history. Rendered by `apps/app/src/pages/matchmaker-settings.tsx`.
 */
export class MatchmakerSettingsPage {
  constructor(public readonly page: Page) {}

  async goto(username: string) {
    await this.page.goto(`/app/mm/${username}/settings`);
  }

  getForm() {
    return this.page.getByTestId("matchmaker-settings-form");
  }

  getUsername() {
    return this.page.getByTestId("matchmaker-settings-username");
  }

  getDisplayNameInput() {
    return this.getForm().getByLabel("Display name");
  }

  getBusinessNameInput() {
    return this.getForm().getByLabel("Business name (optional)");
  }

  getSaveButton() {
    return this.page.getByRole("button", { name: "Save changes" });
  }

  getStatus() {
    return this.page.getByTestId("matchmaker-settings-status");
  }

  async save(fields: { displayName?: string; businessName?: string }) {
    if (fields.displayName !== undefined) {
      await this.getDisplayNameInput().fill(fields.displayName);
    }
    if (fields.businessName !== undefined) {
      await this.getBusinessNameInput().fill(fields.businessName);
    }
    await this.getSaveButton().click();
  }

  /** History entries, newest first. */
  getHistoryEntries() {
    return this.page.getByTestId("profile-history").getByRole("listitem");
  }
}
