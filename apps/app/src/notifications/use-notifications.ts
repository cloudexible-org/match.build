import { api } from "@repo/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import type { Notification } from "./notifications";

/**
 * What the bell shows, from the backend that derives it
 * (`convex/notifications/queries.ts`).
 *
 * The server decides everything — which conversations are waiting, what each
 * item says, and which are new since the panel was last opened — so the view
 * takes the list as it comes. `read` is one watermark per account, which is
 * why marking is one mutation with no arguments rather than one per item.
 *
 * While the query is loading there is nothing to show: an empty bell for a
 * moment is better than a count that lands and then changes.
 */
export function useNotifications(): {
  items: Notification[];
  markAllRead: () => void;
} {
  const feed = useQuery(api.notifications.queries.feed);
  const markFeedSeen = useMutation(api.notifications.mutations.markFeedSeen);

  const markAllRead = useCallback(() => {
    void markFeedSeen({});
  }, [markFeedSeen]);

  return { items: feed ?? [], markAllRead };
}
