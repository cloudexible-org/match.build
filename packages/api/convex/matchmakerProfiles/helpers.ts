/**
 * Reading and writing a matchmaker's own profile (prd/phase-2.md §4.1C).
 * Plain functions taking a `ctx`; nothing here is registered as a function.
 *
 * The write engine is `convex/profiles/helpers.ts`, shared with a candidate's
 * profile — which is the point of it being shared: "an agent never overwrites
 * what a person typed" holds for a matchmaker's voice exactly as it does for a
 * candidate's birth date.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * A profile row is created lazily, on the first value written. Until then
 * there is nothing to read, and `null` is the honest answer.
 */
export async function matchmakerProfileFor(
  ctx: QueryCtx,
  matchmakerId: Id<"matchmakers">,
): Promise<Doc<"matchmakerProfiles"> | null> {
  return await ctx.db
    .query("matchmakerProfiles")
    .withIndex("by_matchmakerId", (q) => q.eq("matchmakerId", matchmakerId))
    .unique();
}

export async function ensureMatchmakerProfile(
  ctx: MutationCtx,
  matchmakerId: Id<"matchmakers">,
): Promise<Doc<"matchmakerProfiles">> {
  const existing = await matchmakerProfileFor(ctx, matchmakerId);
  if (existing !== null) return existing;
  const id = await ctx.db.insert("matchmakerProfiles", {
    matchmakerId,
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get("matchmakerProfiles", id);
  if (created === null) throw new Error("The profile vanished as it was made.");
  return created;
}
