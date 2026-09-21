import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches, kept in sync as the viewport
 * changes.
 *
 * Layout belongs in CSS; this is for the rare decision CSS can't make —
 * the candidate shell only opens a conversation on its own where the list
 * stays beside it (see `pages/candidate.tsx`).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // No viewport on the server; the narrow layout is the safe assumption.
    () => false,
  );
}
