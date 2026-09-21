import type { Page } from "@playwright/test";

/** The rows `apps/app/src/chat/suggestions.ts` names, in stack order. */
export type SuggestionKind =
  | "match"
  | "matchmakerProfile"
  | "candidateProfile"
  | "reply";

/**
 * The stack of suggestion cards above the message composer. Rendered by
 * `apps/app/src/chat/suggestion-stack.tsx` and filled by
 * `chat/conversation-suggestions.tsx`.
 *
 * One row per kind, one card showing per row. Everything here is addressed by
 * kind rather than by position, so a test never depends on which rows happen
 * to be open.
 */
export class SuggestionsPage {
  constructor(public readonly page: Page) {}

  getRoot() {
    return this.page.getByTestId("suggestion-stack");
  }

  /** Every open row, however many cards each of them is hiding. */
  getRows() {
    return this.page.getByTestId("suggestion-row");
  }

  getRow(kind: SuggestionKind) {
    return this.page.locator(
      `[data-testid="suggestion-row"][data-kind="${kind}"]`,
    );
  }

  /** The one card a row is showing. */
  getCard(kind: SuggestionKind) {
    return this.getRow(kind).getByTestId("suggestion-card");
  }

  /** "2/5", or hidden where the row has only one card. */
  getCounter(kind: SuggestionKind) {
    return this.getRow(kind).getByTestId("suggestion-counter");
  }

  /** Which card is showing, by the id `conversation-suggestions.tsx` gave it. */
  getShowingId(kind: SuggestionKind) {
    return this.getCard(kind).getAttribute("data-suggestion-id");
  }

  /** Towards the newer end of the row. */
  async goNewer(kind: SuggestionKind) {
    await this.getRow(kind).getByTestId("suggestion-previous").click();
  }

  /** Towards the older end of the row. */
  async goOlder(kind: SuggestionKind) {
    await this.getRow(kind).getByTestId("suggestion-next").click();
  }

  getNewerButton(kind: SuggestionKind) {
    return this.getRow(kind).getByTestId("suggestion-previous");
  }

  getOlderButton(kind: SuggestionKind) {
    return this.getRow(kind).getByTestId("suggestion-next");
  }

  /** Takes what the showing card proposes. */
  async accept(kind: SuggestionKind) {
    await this.getCard(kind).getByTestId("suggestion-accept").click();
  }

  /** Turns down the showing card, and only that one. */
  async dismiss(kind: SuggestionKind) {
    await this.getCard(kind).getByTestId("suggestion-dismiss").click();
  }
}
