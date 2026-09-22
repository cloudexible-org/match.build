import { cn } from "@repo/ui";
import type { ReactNode } from "react";

/**
 * The first row of every column: the list's heading, the conversation's
 * header, and the panel's own bar on a phone.
 *
 * From `lg` up all three columns are on screen at once, and their first
 * horizontal rule reads as one line across the window. The panel's, though,
 * is the divider under its first accordion section rather than a header of
 * its own, and an accordion trigger is 44px. The headers used to be `h-14`,
 * so the rule in the third column sat eleven pixels lower than the other two
 * and the columns read as three pages parked side by side.
 *
 * `--spacing-column-header` (`@repo/ui/theme.css`) is that 44px plus the
 * pixel a header's own `border-b` takes out of its box; changing the trigger
 * instead was the wrong half of it, because `AccordionSection` is a
 * `@repo/ui` component and cannot promise a height for a title it doesn't
 * choose.
 *
 * Anything put in here has to live inside 44px — a `size="sm"` button (32px)
 * does, a title stacked over a subtitle does not, which is why the
 * conversation header reads its subtitle inline.
 */
export const COLUMN_HEADER = "h-column-header shrink-0 border-b border-border";

/**
 * The columns both sides of the product are laid out in: a list beside a
 * conversation (prd/phase-1.md §4.1 and §4.2).
 *
 * The matchmaker's workspace and the candidate's shell are the same shape
 * from opposite sides, and the same shape is what has to give on a phone —
 * one column at a time, the list until something is open. That rule lives
 * here rather than in both pages, because getting it half-right in one of
 * them is how a page starts scrolling sideways.
 *
 * The shell fills what the header leaves and never grows past it
 * (`overflow-hidden`): every column scrolls inside itself, so the window
 * never does and the composer stays on screen. Each column is handed
 * `min-h-0` for the same reason — a flex item's automatic minimum size is
 * its content, and without this the tallest column pushes the page open.
 *
 * `list` is a render prop rather than a node so the column's classes reach
 * the list's own element: neither list wants a wrapper around it.
 */
export function ChatShell({
  testId,
  open,
  list,
  children,
}: {
  /** The shell's own test id; the conversation column gets `-conversation`. */
  testId: string;
  /** Whether a conversation is open — on a phone, which column shows. */
  open: boolean;
  list: (className: string) => ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-0 flex-1 overflow-hidden" data-testid={testId}>
      {list(
        cn(
          "min-h-0 w-full md:flex md:w-80 md:shrink-0 md:border-r",
          open ? "hidden" : "flex",
        ),
      )}
      <section
        aria-label="Conversation"
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          open ? "flex" : "hidden",
        )}
        data-testid={`${testId}-conversation`}
      >
        {children}
      </section>
    </main>
  );
}
