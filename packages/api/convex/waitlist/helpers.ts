import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Database helpers for the waitlist. Take a `ctx` and are called from this
 * domain's queries and mutations; never registered as functions themselves.
 */

/** The sign-up for an already-normalised email, or `null`. */
export async function findByEmail(
  ctx: QueryCtx,
  email: string,
): Promise<Doc<"waitlist"> | null> {
  return await ctx.db
    .query("waitlist")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

/** Trims a free-text field; blank becomes `undefined` so it is not stored. */
export function optionalText(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}
