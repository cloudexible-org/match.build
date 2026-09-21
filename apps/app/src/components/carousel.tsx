import { Button, cn } from "@repo/ui";

/**
 * The furniture of a carousel: two arrows and a counter.
 *
 * Shared so the suggestion cards above the composer and the matches in the
 * candidate panel look like the same control, because they are one. The
 * counter is separate from the arrows rather than built into them, because
 * the two places arrange them differently: the panel puts an arrow either
 * side of the card and the counter in the heading above it, while a
 * suggestion card is full width and gathers all three into its own header as
 * `‹ 1/2 ›`. A component that insisted on one arrangement would be used in
 * neither.
 *
 * Neither holds state. Which item is showing is the caller's, and the
 * arithmetic is `lib/carousel.ts`.
 */

export function CarouselArrow({
  direction,
  label,
  disabled,
  onClick,
  className,
}: {
  direction: "previous" | "next";
  /** Named for a screen reader: an arrow glyph alone says nothing. */
  label: string;
  disabled: boolean;
  onClick: () => void;
  /** For a tighter arrangement — the pair inside a card's header. */
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("size-8 shrink-0 p-0", className)}
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
