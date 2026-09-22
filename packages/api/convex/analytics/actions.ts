import { v } from "convex/values";
import { env, internalAction } from "../_generated/server";
import { batchUrl, posthogBatch } from "./rules";

/**
 * Sends the PostHog events for one audit event, scheduled by
 * `emitAuditAnalytics` (./helpers.ts). Over `fetch`, never `"use node"` — see
 * AGENTS.md: the e2e backend cannot run Node actions at all.
 *
 * Not retried. A lost analytics event costs a count; a retry loop that
 * double-sends costs a wrong one.
 */
export const capture = internalAction({
  args: {
    captures: v.array(
      v.object({
        event: v.string(),
        distinctId: v.string(),
        personless: v.boolean(),
        properties: v.record(v.string(), v.union(v.string(), v.boolean())),
      }),
    ),
    group: v.optional(v.string()),
    timestamp: v.number(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    // The key can be removed between scheduling and running.
    const apiKey = env.POSTHOG_API_KEY;
    if (!apiKey) return null;
    const response = await fetch(batchUrl(env.POSTHOG_HOST), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        posthogBatch(apiKey, args.captures, {
          group: args.group,
          timestamp: args.timestamp,
        }),
      ),
    });
    if (!response.ok) {
      throw new Error(
        `Could not send ${args.captures.length} analytics event(s) (PostHog ${response.status}).`,
      );
    }
    return null;
  },
});
