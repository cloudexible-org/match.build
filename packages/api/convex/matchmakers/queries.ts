import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../users/helpers";
import { usernameKey } from "./rules";

/**
 * The workspace a `/mm/:username` URL selects, or `null`.
 *
 * Looked up by canonical key, so `/mm/JaneSmith` finds `jane.smith`; the app
 * compares `username` with the URL and redirects to the chosen form.
 *
 * Only the owner gets the profile back. For anyone else — and for a username
 * nobody has — the answer is the same `null`, so the workspace URL can't be
 * used to tell the two apart.
 */
export const workspace = query({
  args: { username: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      matchmakerId: v.id("matchmakers"),
      username: v.string(),
      displayName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    const key = usernameKey(args.username);
    if (!key) return null;
    const matchmaker = await ctx.db
      .query("matchmakers")
      .withIndex("by_usernameKey", (q) => q.eq("usernameKey", key))
      .first();
    if (matchmaker === null || matchmaker.ownerUserId !== user._id) {
      return null;
    }
    return {
      matchmakerId: matchmaker._id,
      username: matchmaker.username,
      displayName: matchmaker.displayName,
    };
  },
});

// A profile changes rarely; this is far more than settings will ever show.
