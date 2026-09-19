import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * The most recent unsent email to an address. Internal: the e2e suite reads
 * sign-in codes through it with the local backend's admin key, and a
 * developer can run it from the dashboard. Never exposed publicly — the outbox
 * holds sign-in codes in plain text.
 */
export const latestOutboxEmail = internalQuery({
  args: { to: v.string() },
  returns: v.union(
    v.null(),
    v.object({ subject: v.string(), text: v.string() }),
  ),
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("emailOutbox")
      .withIndex("by_to", (q) => q.eq("to", args.to))
      .order("desc")
      .first();
    return latest === null
      ? null
      : { subject: latest.subject, text: latest.text };
  },
});
