import { Button, buttonVariants, cn } from "@repo/ui";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { COLUMN_HEADER } from "./chat-shell";

/**
 * A conversation with its side panel, on both sides of the product: the
 * matchmaker's candidate panel (prd/phase-1.md §4.1) and the candidate's
 * panel about their matchmaker (§4.2).
 *
 * The panel sits alongside from `lg` up, where it needs no control at all;
 * on anything narrower it is collapsed behind a Details button and takes the
 * whole column while it's open, which is what makes either side usable on a
 * phone. That, the header and the state behind the toggle are the same both
 * ways round, so they live here; what goes in the header and the panel does
 * not.
 */
export function ConversationPanes({
  testId,
  back,
  title,
  titleTestId,
  subtitle,
  panelLabel,
  panelToggleTestId,
  headerAction,
  panel,
  children,
}: {
  testId: string;
  /** Back to the list, on a phone where the list is hidden. */
  back: { to: string; label: string };
  title: string;
  titleTestId: string;
  /** Beside the title, where one side has more to say. */
  subtitle?: ReactNode;
  /** Names the panel for a screen reader, e.g. "About Jane Member". */
  panelLabel: string;
  panelToggleTestId: string;
  /** A control in the header, before the Details button. */
  headerAction?: ReactNode;
  /** Rendered with the way to close it again below `lg`. */
  panel: (close: () => void) => ReactNode;
  /** The conversation itself, under the header. */
  children: ReactNode;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  // `min-w-0`: without it this flex row can grow past a phone's viewport and
  // the whole page scrolls sideways. `min-h-0` is the same thing downwards —
  // the conversation and the panel each scroll inside themselves, and neither
  // may push the shell taller than the viewport.
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      data-testid={testId}
    >
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col",
          panelOpen ? "hidden lg:flex" : "flex",
        )}
      >
        <header
          className={cn(COLUMN_HEADER, "flex items-center gap-3 px-4")}
          data-testid={`${testId}-header`}
        >
          <Link
            to={back.to}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "md:hidden",
            )}
            aria-label={back.label}
          >
            ←
          </Link>
          {/* The subtitle sits *beside* the title rather than under it: this
              row is 44px so that the three columns' first rule is one line
              across the window (`COLUMN_HEADER`), and two stacked lines do not
              fit in 44px. `items-baseline` so the small line sits on the same
              baseline as the name instead of floating in the middle of it.

              Both halves truncate, and both may shrink — `truncate` sets
              `overflow: hidden`, which is what lets a flex item go below its
              own content width. A long name and a long email therefore give
              way together rather than one of them pushing the other out of
              the header. */}
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            {/* `h2`: the list column owns the page's `h1`. */}
            <h2 className="truncate font-medium" data-testid={titleTestId}>
              {title}
            </h2>
            {subtitle}
          </div>
          {headerAction}
          {/* Below `lg` only: from `lg` up the panel is always alongside, and
              a button that opens what is already open is just a dead control
              taking a header slot. */}
          <Button
            variant="outline"
            size="sm"
            aria-expanded={panelOpen}
            data-testid={panelToggleTestId}
            className="lg:hidden"
            onClick={() => setPanelOpen((open) => !open)}
          >
            Details
          </Button>
        </header>
        {children}
      </div>

      <aside
        aria-label={panelLabel}
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-hidden border-border lg:flex lg:max-w-sm lg:border-l",
          panelOpen ? "flex" : "hidden",
        )}
      >
        {panel(() => setPanelOpen(false))}
      </aside>
    </div>
  );
}
