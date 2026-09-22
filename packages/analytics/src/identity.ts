"use client";

import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";

export interface AnalyticsIdentity {
  /**
   * Opaque account id of the signed-in person, `null` when signed out, and
   * `undefined` while that is still loading — which is not a change and is
   * ignored.
   */
  userId?: string | null;
  /**
   * Tenant whose workspace the person is currently inside, `null` when
   * outside one, `undefined` while unknown.
   */
  groupKey?: string | null;
  /** Group type the key belongs to. Required once `groupKey` is used. */
  groupType?: string;
}

/**
 * Keeps PostHog's idea of who is using the app in step with the app's own.
 *
 * State is diffed here rather than fired from the sign-in and sign-out call
 * sites: there are three places that sign out today, and the one that matters
 * most — a stale session signing itself out — is not a click at all.
 *
 * Only the opaque account id is sent. Name and email stay in the backend:
 * analytics answers "how many", which an id answers just as well, and every
 * personal field sent here is one more copy for a future erasure to reach.
 */
export function useAnalyticsIdentity({
  userId,
  groupKey,
  groupType,
}: AnalyticsIdentity): void {
  const posthog = usePostHog();
  const identified = useRef<string | null>(null);
  const grouped = useRef<string | null>(null);

  useEffect(() => {
    // Without a key the provider is never mounted, so the client stays
    // unloaded and every call below would be a no-op with a console warning.
    if (!posthog?.__loaded) return;
    if (userId === undefined || userId === identified.current) return;

    if (userId === null) {
      // Clears the person and their groups together: on a shared browser the
      // next session must not inherit the last one.
      posthog.reset();
      identified.current = null;
      grouped.current = null;
      return;
    }
    posthog.identify(userId);
    identified.current = userId;
  }, [posthog, userId]);

  useEffect(() => {
    if (!posthog?.__loaded) return;
    if (groupType === undefined) return;
    if (groupKey === undefined || groupKey === grouped.current) return;

    if (groupKey === null) {
      // Groups are sticky until cleared, so leaving a workspace has to say so
      // or every later event is filed under the one last visited.
      posthog.resetGroups();
      grouped.current = null;
      return;
    }
    posthog.group(groupType, groupKey);
    grouped.current = groupKey;
  }, [posthog, groupKey, groupType]);
}
