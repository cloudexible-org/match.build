import type { Page } from "@playwright/test";

/**
 * `apps/app` home (`/app/`): the signed-in account's invitations, matchmaker
 * profiles and joined matchmakers. Rendered by `apps/app/src/pages/home.tsx`.
 *
 * Two kinds of account get this page: a brand-new one with nothing yet,
 * which is asked whether it is a matchmaker or looking for a match, and one
 * that owns more than one matchmaker profile. The rest are redirected — to
 * their one workspace, or to `CandidateShellPage`.
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

  /** The new account's choice between the two sides of the app. */
  getChooseSide() {
    return this.page.getByTestId("home-choose-side");
  }

  getChooseMatchmakerLink() {
    return this.page.getByTestId("home-choose-matchmaker");
  }

  getChooseCandidateLink() {
    return this.page.getByTestId("home-choose-candidate");
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
