import { MatchBoard } from "../matches/board";

/**
 * The match board (prd/phase-3.md §2), at `/mm/:username/matches`.
 *
 * A page of its own rather than a panel in the chat shell, and deliberately not
 * the `Page` column the rest of the app is read at: reviewing matches is a
 * different mode of work from reading a conversation, and a board needs the
 * width of the screen. The workspace layout above it provides the header and
 * the vertical scroll; the board scrolls sideways inside it.
 */
export function MatchesPage() {
  return <MatchBoard />;
}
