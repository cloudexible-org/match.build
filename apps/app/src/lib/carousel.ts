/**
 * Which item of a row is showing, for anything that shows one at a time with
 * arrows through the rest.
 *
 * Two surfaces use this: the suggestion cards above the composer
 * (`chat/suggestion-stack.tsx`) and the matches in the candidate panel
 * (`workspace/candidate-matches.tsx`). It lives here rather than in either of
 * them because it is about neither — it is the arithmetic of a carousel, and
 * it is the part that is easy to get wrong.
 */

/** Anything a carousel can walk: an id is all it needs. */
export type Carouselled = { id: string };

/**
 * Which item is showing: the one last chosen while it is still there, and
 * otherwise the first.
 *
 * A row nobody has touched shows the first, and a row whose selection has gone
 * falls back to it rather than going blank.
 */
export function currentIndex(
  items: readonly Carouselled[],
  selectedId: string | null,
): number {
  if (selectedId === null) return 0;
  const index = items.findIndex((item) => item.id === selectedId);
  return index === -1 ? 0 : index;
}

/**
 * The item `step` away, or `null` at either end.
 *
 * The arrows stop rather than wrapping: "1/5" and "5/5" then say where you are
 * without anyone having to count how many times they have pressed it.
 */
export function stepId(
  items: readonly Carouselled[],
  index: number,
  step: -1 | 1,
): string | null {
  return items[index + step]?.id ?? null;
}

/**
 * What to show once the item at `index` leaves the row: the next one along,
 * else the one before it, else nothing — `null`, which is also what an
 * untouched row holds, so an emptied row behaves like a new one.
 *
 * Chosen *before* the thing that removes it runs. The query drops the answered
 * item on its own, and a row that waited would fall back to the first and move
 * an item the reader had arrowed to out from under them.
 */
export function idAfterDismiss(
  items: readonly Carouselled[],
  index: number,
): string | null {
  return items[index + 1]?.id ?? items[index - 1]?.id ?? null;
}
