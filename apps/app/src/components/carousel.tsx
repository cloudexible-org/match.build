import { Button, cn } from "@repo/ui";

/**
 * The furniture of a carousel: an arrow either side, and a counter.
 *
 * Shared so the suggestion cards above the composer and the matches in the
 * candidate panel look like the same control, because they are one. The
 * counter is separate from the arrows rather than built into them: on a
 * suggestion card it belongs in the card's own header, and in the panel it
 * belongs in the section heading, and a component that insisted on one
 * position would be used in neither.
 *
 * Neither holds state. Which item is showing is the caller's, and the
 * arithmetic is `lib/carousel.ts`.
 */

export function CarouselArrow({
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
      data-testid={`carousel-${direction}`}
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

/** "2/5". Rendered by the caller only where there is more than one. */
export function CarouselCounter({
  index,
  count,
  className,
}: {
  /** Zero-based; shown one-based, because nobody counts from zero out loud. */
  index: number;
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 text-xs tabular-nums text-muted-foreground",
        className,
      )}
      data-testid="carousel-counter"
    >
      {index + 1}/{count}
    </span>
  );
}

/** The space an arrow would take, in a row with nowhere to go. */
export function CarouselGutter() {
  return <div aria-hidden className="size-8 shrink-0" />;
}
