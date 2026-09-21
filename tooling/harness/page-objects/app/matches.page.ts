import type { Locator, Page } from "@playwright/test";

/** The three columns, left to right. Closed is off the board and below it. */
export type MatchStage = "proposed" | "introduced" | "connected";

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

  /** The workspace's scrolling frame, which the board should exactly fill. */
  getFrame() {
    return this.page.getByTestId("workspace-frame");
  }

  /** How far the frame scrolls past what is in it. Should always be 0. */
  async frameOverflow(): Promise<number> {
    return await this.getFrame().evaluate(
      (el) => el.scrollHeight - el.clientHeight,
    );
  }

  /**
   * How far the *document* scrolls. Should always be 0 inside the workspace,
   * which is a `h-dvh` shell — and is not, the moment anything inside it is
   * absolutely positioned without a positioned ancestor, because no scroll
   * container clips such an element and it stretches the page instead.
   */
  async pageScroll(): Promise<number> {
    return await this.page.evaluate(() => {
      window.scrollTo(0, 100_000);
      const reached = window.scrollY;
      window.scrollTo(0, 0);
      return reached;
    });
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

  /** The collapsed line under the board, and what it opens. */
  getClosed() {
    return this.page.getByTestId("match-closed");
  }

  getClosedToggle() {
    return this.page.getByTestId("match-closed-toggle");
  }

  async openClosed() {
    await this.getClosedToggle().click();
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

  getCardsIn(stage: MatchStage | "closed") {
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

  async openCloseForm(card: Locator) {
    await card.getByTestId("match-card-menu").click();
    await this.page.getByTestId("match-close").click();
  }

  /**
   * The button for one person in the close form, by the name on it.
   *
   * By name rather than by `candidateA`/`candidateB`: a pair is stored with
   * its ids in a fixed order, so which of the two is "A" is not the order a
   * spec seeded them in — and a test that picked the button by position would
   * pass or fail on how two ids happened to sort.
   */
  getClosedBy(card: Locator, name: string) {
    return card
      .getByTestId("close-form")
      .getByRole("button", { name, exact: true });
  }

  /** Closes a card: how it ended, who ended it (by name), why. */
  async close(
    card: Locator,
    outcome: "together" | "didnt_work",
    options: { who?: string; note?: string; archiveBoth?: boolean } = {},
  ) {
    await this.openCloseForm(card);
    await card.getByTestId(`close-as-${outcome}`).click();
    if (options.who !== undefined) {
      await this.getClosedBy(card, options.who).click();
    }
    if (options.note !== undefined) {
      await card.getByTestId("close-note").fill(options.note);
    }
    if (options.archiveBoth === false) {
      await card.getByTestId("close-archive-both").uncheck();
    }
    await card.getByTestId("close-submit").click();
  }

  /** The line on a closed card saying how it ended. */
  getClosingLine(card: Locator) {
    return card.getByTestId("match-card-closing");
  }

  getOutcomeBadge(card: Locator) {
    return card.getByTestId("match-card-outcome");
  }

  /** The dot on a card nobody has looked at yet. */
  getNewDot(card: Locator) {
    return card.getByTestId("match-card-new");
  }

  /** The button that takes the dot off — explicit, never a side effect. */
  getMarkSeen(card: Locator) {
    return card.getByTestId("match-card-mark-seen");
  }

  async markSeen(card: Locator) {
    await this.getMarkSeen(card).click();
  }

  getExpand(card: Locator) {
    return card.getByTestId("match-card-expand");
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
