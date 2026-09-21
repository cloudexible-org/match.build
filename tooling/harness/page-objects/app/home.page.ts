import type { Page } from "@playwright/test";

/**
 * `apps/app` home (`/app/`): the signed-in account's invitations, matchmaker
 * profiles and joined matchmakers. Rendered by `apps/app/src/pages/home.tsx`.
 *
 * Only an account that owns a matchmaker profile gets this page; the rest
 * are redirected to `CandidateShellPage`.
 *
 * Sections are located by `data-testid`; rows by their visible text, which is
 * what a person scans for.
 */
export class HomePage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/app/");
  }

  getWelcomeHeading() {
    return this.page.getByRole("heading", { level: 1, name: /^Welcome/ });
  }

  getAccountName() {
    return this.page.getByTestId("header-account-name");
  }

  getSignOutButton() {
    return this.page.getByRole("button", { name: "Sign out" });
  }

  getInvitationsSection() {
    return this.page.getByTestId("home-invitations");
  }

  getMatchmakerProfilesSection() {
    return this.page.getByTestId("home-matchmaker-profiles");
  }

  getCandidateProfilesSection() {
    return this.page.getByTestId("home-candidate-profiles");
  }

  /** A row in one of the sections, by any text it contains. */
  getRow(
    section: "invitations" | "matchmakerProfiles" | "candidateProfiles",
    text: string,
  ) {
    const root = {
      invitations: this.getInvitationsSection(),
      matchmakerProfiles: this.getMatchmakerProfilesSection(),
      candidateProfiles: this.getCandidateProfilesSection(),
    }[section];
    return root.getByRole("listitem").filter({ hasText: text });
  }
}
