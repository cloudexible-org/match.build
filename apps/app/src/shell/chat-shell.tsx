import { cn } from "@repo/ui";
import type { ReactNode } from "react";

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
    <main className="flex min-h-0 flex-1" data-testid={testId}>
      {list(
        cn(
          "w-full md:flex md:w-80 md:shrink-0 md:border-r",
          open ? "hidden" : "flex",
        ),
      )}
      <section
        aria-label="Conversation"
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          open ? "flex" : "hidden",
        )}
        data-testid={`${testId}-conversation`}
      >
        {children}
      </section>
    </main>
  );
}
