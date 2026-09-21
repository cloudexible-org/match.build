import { cn } from "@/lib/utils";

/**
 * Two interlocking rings — a match, drawn plainly. Decorative: it always sits
 * next to the visible "match.build" wordmark.
 */
export function BrandMark({
  className,
}: {
  className?: string;
}): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      className={cn("h-5 w-5", className)}
    >
      <circle cx="12" cy="16" r="7.5" />
      <circle cx="20" cy="16" r="7.5" />
    </svg>
  );
}
