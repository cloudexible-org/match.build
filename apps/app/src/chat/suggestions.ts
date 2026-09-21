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
 * **A suggested match is not one of these.** It was, while it was hypothetical;
 * now that matching is built it lives in the candidate panel
 * (`workspace/candidate-matches.tsx`), on the same card the board draws. A
 * match is about two people and belongs where the rest of what is known about
 * them is, not over the box for writing to one of them.
 */
export const SUGGESTION_KINDS = [
  "matchmakerProfile",
  "candidateProfile",
  "reply",
] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** Names the row, above the card and to a screen reader. */
export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
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
