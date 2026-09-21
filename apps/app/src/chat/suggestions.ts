/**
 * What can be suggested above the composer, and which one of a row is showing.
 *
 * A stack is **one row per kind, and at most one card per row**: proposals
 * about four different things are four rows, but five proposals about the same
 * candidate's profile are one row with arrows through them. A matchmaker
 * looking at the bottom of a conversation should see what the assistant is
 * asking them, not a pile of it.
 *
 * Plain logic with no React and no Convex, so the part that is easy to get
 * wrong — which card survives an answer — is unit-tested rather than driven
 * through a browser (`suggestions.test.ts`).
 */

/**
 * Bottom-up: the row nearest the composer is the one about the message being
 * written, and the further from it, the further from what is being typed.
 *
 * `reply` and `match` are declared here and nothing produces them yet — the
 * reply suggester and the matcher are prd/phase-2.md §4A and phase 3. They are
 * named now because the row order is the contract this file exists to state,
 * and a stack that has to be re-ordered when the third kind arrives is a stack
 * that was only ever written for two.
 */
export const SUGGESTION_KINDS = [
  "match",
  "matchmakerProfile",
  "candidateProfile",
  "reply",
] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** Names the row, above the card and to a screen reader. */
export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  match: "Suggested match",
  matchmakerProfile: "Suggested change to your profile",
  candidateProfile: "Suggested change to their profile",
  reply: "Suggested reply",
};

export type Suggestion = {
  /** Unique across the whole stack, and stable for as long as it is open. */
  id: string;
  kind: SuggestionKind;
  /** When the assistant proposed it. The newest sorts first in its row. */
  suggestedAt: number;
};

export type SuggestionRow<T extends Suggestion> = {
  kind: SuggestionKind;
  /** Newest first, never empty. */
  items: T[];
};

/**
 * The stack: one row per kind that has something to say, in
 * `SUGGESTION_KINDS` order, each row newest first.
 *
 * Ties break on `id` so the order is total — two proposals written in the same
 * millisecond must not swap places between renders and move the card out from
 * under a cursor.
 */
export function rowsByKind<T extends Suggestion>(
  suggestions: readonly T[],
): SuggestionRow<T>[] {
  return SUGGESTION_KINDS.flatMap((kind) => {
    const items = suggestions
      .filter((suggestion) => suggestion.kind === kind)
      .sort(
        (a, b) =>
          b.suggestedAt - a.suggestedAt ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    return items.length === 0 ? [] : [{ kind, items }];
  });
}

/**
 * Which card a row is showing: the one last chosen while it is still there,
 * and otherwise the newest.
 *
 * A row nobody has touched shows the newest — the one worth answering — and a
 * row whose selection has gone falls back to it rather than going blank.
 */
export function currentIndex(
  items: readonly Suggestion[],
  selectedId: string | null,
): number {
  if (selectedId === null) return 0;
  const index = items.findIndex((item) => item.id === selectedId);
  return index === -1 ? 0 : index;
}

/**
 * The card `step` away, or `null` at either end.
 *
 * The arrows stop rather than wrapping: "1/5" and "5/5" then say where you are
 * without anyone having to count how many times they have pressed it.
 */
export function stepId(
  items: readonly Suggestion[],
  index: number,
  step: -1 | 1,
): string | null {
  return items[index + step]?.id ?? null;
}

/**
 * What to show once the card at `index` is answered and leaves the row: the
 * next one along, else the one before it, else nothing — `null`, which is also
 * what an untouched row holds, so an emptied row behaves like a new one.
 *
 * Chosen *before* the mutation runs. The query drops the answered card on its
 * own, and a row that waited would fall back to the newest and move a card the
 * matchmaker had arrowed to out from under them.
 */
export function idAfterDismiss(
  items: readonly Suggestion[],
  index: number,
): string | null {
  return items[index + 1]?.id ?? items[index - 1]?.id ?? null;
}
