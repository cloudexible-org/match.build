import { Button, cn } from "@repo/ui";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import {
  currentIndex,
  idAfterDismiss,
  rowsByKind,
  SUGGESTION_KIND_LABELS,
  type Suggestion,
  type SuggestionKind,
  stepId,
} from "./suggestions";

/**
 * The assistant's open proposals, stacked above the composer
 * (prd/phase-2.md §5).
 *
 * One row per kind and one card per row (`suggestions.ts`), each row a
 * carousel: arrows either side, a counter, and the newest showing until the
 * matchmaker arrows away from it. Nothing here is on the record — the dashed
 * border and the tinted ground are the same treatment the candidate panel
 * gives a proposal, and deliberately unlike both a saved value and a message.
 *
 * Presentation only. What a card says and what answering it does are passed
 * in, so the row that will hold a drafted reply needs no change here.
 */

export type SuggestionAction = {
  label: string;
  variant?: "default" | "outline";
  run: () => unknown;
};

export type SuggestionCard = Suggestion & {
  /** What the card is about, beside the row's label — e.g. "Wants kids". */
  subject?: string;
  /** The proposal itself. */
  body: ReactNode;
  /** Taking it. A card with none is one there is nothing to do but read. */
  actions?: SuggestionAction[];
  /** Turning it down. Every card has one: a suggestion nobody may refuse isn't one. */
  dismiss: () => unknown;
};

export function SuggestionStack({
  suggestions,
}: {
  suggestions: readonly SuggestionCard[];
}) {
  const rows = rowsByKind(suggestions);
  if (rows.length === 0) return null;
  // Once any row has arrows, every row leaves room for a pair, so the cards
  // line up as one stack rather than stepping in and out by 36px each.
  const gutters = rows.some((row) => row.items.length > 1);
  return (
    // `shrink-0`: the thread above scrolls inside itself, and the stack keeps
    // its height rather than being squeezed as the conversation grows.
    <div
      className="flex shrink-0 flex-col gap-2 px-3 pt-3"
      data-testid="suggestion-stack"
    >
      {rows.map((row) => (
        <Row
          key={row.kind}
          kind={row.kind}
          items={row.items}
          gutters={gutters}
        />
      ))}
    </div>
  );
}

/** One kind's carousel. Holds which card of it is showing. */
function Row({
  kind,
  items,
  /** Leave room for a pair of arrows even where this row has none. */
  gutters,
}: {
  kind: SuggestionKind;
  items: SuggestionCard[];
  gutters: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = currentIndex(items, selectedId);
  const card = items[index];
  if (card === undefined) return null; // `rowsByKind` never yields an empty row
  const olderId = stepId(items, index, 1);
  const newerId = stepId(items, index, -1);
  const many = items.length > 1;

  /**
   * Answering a card, either way. The selection moves first: the query drops
   * the answered card on its own, and a row that waited would fall back to the
   * newest and move a card out from under whoever had arrowed to it.
   */
  function answer(run: () => unknown) {
    setSelectedId(idAfterDismiss(items, index));
    setBusy(true);
    setError(null);
    Promise.resolve(run())
      .catch((caught: unknown) => {
        setError(serverErrorMessage(caught, "That didn't go through."));
        // It is still open, so put it back rather than leaving it skipped.
        setSelectedId(card.id);
      })
      .finally(() => setBusy(false));
  }

  /** Left and Right step the row, for anyone whose focus is inside it. */
  function handleKeyDown(event: KeyboardEvent<HTMLFieldSetElement>) {
    if (event.key === "ArrowLeft" && newerId !== null) {
      event.preventDefault();
      setSelectedId(newerId);
    }
    if (event.key === "ArrowRight" && olderId !== null) {
      event.preventDefault();
      setSelectedId(olderId);
    }
  }

  return (
    // A `fieldset` for its native `group` role, so a screen reader announces
    // what this row's controls are for and it is a real element rather than a
    // `div` wearing a role. `min-w-0` because a fieldset's own
    // `min-width: min-content` would otherwise refuse to shrink on a phone.
    <fieldset
      aria-label={SUGGESTION_KIND_LABELS[kind]}
      className="flex min-w-0 items-center gap-1"
      data-testid="suggestion-row"
      data-kind={kind}
      onKeyDown={handleKeyDown}
    >
      {many ? (
        <Step
          direction="previous"
          label="Newer suggestion"
          disabled={newerId === null}
          onClick={() => setSelectedId(newerId)}
        />
      ) : (
        gutters && <Gutter />
      )}
      <div
        // Nothing here is on the record until somebody says so, so it looks
        // like neither a message nor a saved value.
        className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3"
        data-testid="suggestion-card"
        data-kind={kind}
        data-suggestion-id={card.id}
      >
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
            {SUGGESTION_KIND_LABELS[kind]}
            {card.subject !== undefined && (
              <span className="font-normal"> · {card.subject}</span>
            )}
          </span>
          {many && (
            <span
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
              data-testid="suggestion-counter"
            >
              {index + 1}/{items.length}
            </span>
          )}
        </div>
        {/* Capped rather than clipped: a drafted voice runs to a paragraph,
            and a card that hid the end of it would send someone hunting. */}
        <div className="max-h-32 min-w-0 overflow-y-auto text-sm">
          {card.body}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {card.actions?.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant ?? "default"}
              disabled={busy}
              data-testid="suggestion-accept"
              onClick={() => answer(action.run)}
            >
              {action.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            data-testid="suggestion-dismiss"
            onClick={() => answer(card.dismiss)}
          >
            Dismiss
          </Button>
        </div>
        {error !== null && (
          <p
            role="alert"
            className="text-xs text-destructive"
            data-testid="suggestion-error"
          >
            {error}
          </p>
        )}
      </div>
      {many ? (
        <Step
          direction="next"
          label="Older suggestion"
          disabled={olderId === null}
          onClick={() => setSelectedId(olderId)}
        />
      ) : (
        gutters && <Gutter />
      )}
    </fieldset>
  );
}

/**
 * The space an arrow would have taken, in a row that has nowhere to go. An
 * empty box rather than a disabled button: there is nothing here to tab to,
 * and nothing for a screen reader to read out.
 */
function Gutter() {
  return <div aria-hidden className="size-8 shrink-0" />;
}

/** One of the arrows either side of a row. */
function Step({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  /** Named for a screen reader: an arrow glyph alone says nothing. */
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="size-8 shrink-0 p-0"
      aria-label={label}
      disabled={disabled}
      data-testid={`suggestion-${direction}`}
      onClick={onClick}
    >
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className={cn("size-3", direction === "next" && "rotate-180")}
      >
        <path
          d="M7.5 2 3.5 6l4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Button>
  );
}
