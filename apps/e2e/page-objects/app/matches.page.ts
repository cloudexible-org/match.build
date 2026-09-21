import type { Locator, Page } from "@playwright/test";

/** The five columns, left to right. The Rejected lane is addressed separately. */
export type MatchStage =
  | "suggested"
  | "reviewing"
  | "introduced"
  | "mutual_interest"
  | "connected";

/**
 * The match board (prd/phase-3.md §2), at `/mm/:username/matches`. Rendered by
 * `apps/app/src/matches/board.tsx`.
 *
 * Cards are addressed by the people on them rather than by position: a column
 * is sorted by score, and a test that said "the first card" would start failing
 * the day the weights in `matches/rules.ts` are retuned.
 */
export class MatchesPage {
  constructor(public readonly page: Page) {}

  async goto(username: string) {
    await this.page.goto(`/app/mm/${username}/matches`);
  }

  getRoot() {
    return this.page.getByTestId("match-board");
  }

  getColumn(stage: MatchStage) {
    return this.page.locator(
      `[data-testid="match-column"][data-stage="${stage}"]`,
    );
  }

  /** How many cards a column says it holds. */
  getColumnCount(stage: MatchStage) {
    return this.getColumn(stage).getByTestId("match-column-count");
  }

  getLane() {
    return this.page.getByTestId("match-lane");
  }

  getCards() {
    return this.page.getByTestId("match-card");
  }

  /** The one card with both of these people on it, wherever it is. */
  getCard(first: string, second: string) {
    return this.getCards()
      .filter({ hasText: first })
      .filter({ hasText: second });
  }

  getCardById(matchId: string) {
    return this.page.locator(`[data-match-id="${matchId}"]`);
  }

  getCardsIn(stage: MatchStage | "rejected") {
    return this.page.locator(
      `[data-testid="match-card"][data-stage="${stage}"]`,
    );
  }

  getScore(card: Locator) {
    return card.getByTestId("match-card-score");
  }

  getReasons(card: Locator) {
    return card.getByTestId("match-card-reason");
  }

  /** Moves a card through the menu — the path that works without a mouse. */
  async move(card: Locator, stage: MatchStage) {
    await card.getByTestId("match-card-menu").click();
    await this.page.getByTestId(`match-move-${stage}`).click();
  }

  async openRejectForm(card: Locator) {
    await card.getByTestId("match-card-menu").click();
    await this.page.getByTestId("match-reject").click();
  }

  /**
   * The button for one person in the reject form, by the name on it.
   *
   * By name rather than by `candidateA`/`candidateB`: a pair is stored with its
   * ids in a fixed order, so which of the two is "A" is not the order a spec
   * seeded them in — and a test that picked the button by position would pass
   * or fail on how two ids happened to sort.
   */
  getRejectBy(card: Locator, name: string) {
    return card
      .getByTestId("reject-form")
      .getByRole("button", { name, exact: true });
  }

  /** Turns a card down: who (by name, or "You"), why, submit. */
  async reject(card: Locator, who: string, reason: string) {
    await this.openRejectForm(card);
    await this.getRejectBy(card, who).click();
    await card.getByTestId("reject-reason").fill(reason);
    await card.getByTestId("reject-submit").click();
  }

  getRejection(card: Locator) {
    return card.getByTestId("match-card-rejection");
  }

  /** Records one side's answer to an introduction. */
  async respond(card: Locator, side: "a" | "b", response: "yes" | "no") {
    await card.getByTestId(`match-response-${side}-${response}`).click();
  }

  async findMatches() {
    await this.page.getByTestId("find-matches").click();
  }

  getRunSummary() {
    return this.page.getByTestId("run-summary");
  }

  async openPairForm() {
    await this.page.getByTestId("pair-two-people").click();
  }

  /** Pairs two people by hand, by the names in the two pickers. */
  async pair(first: string, second: string) {
    await this.openPairForm();
    await this.page.getByTestId("new-match-a").selectOption({ label: first });
    await this.page.getByTestId("new-match-b").selectOption({ label: second });
    await this.page.getByTestId("new-match-save").click();
  }

  getPairError() {
    return this.page.getByTestId("new-match-error");
  }

  getBoardError() {
    return this.page.getByTestId("board-error");
  }
}
