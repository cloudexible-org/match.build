import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../users/helpers";
import { requireMatchmaker } from "./helpers";
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
      businessName: v.optional(v.string()),
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
      businessName: matchmaker.businessName,
    };
  },
});

// A profile changes rarely; this is far more than settings will ever show.
const MAX_PROFILE_HISTORY = 50;

/**
 * The profile's own audit events, newest first, for its settings page
 * (prd/phase-1.md §5.1: profile events are shown there, not in a candidate's
 * History). `before` / `after` are JSON-encoded, as stored.
 */
export const profileHistory = query({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.array(
    v.object({
      _id: v.id("auditEvents"),
      _creationTime: v.number(),
      action: v.string(),
      changes: v.array(
        v.object({
          field: v.string(),
          before: v.optional(v.string()),
          after: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const events = await ctx.db
      .query("auditEvents")
      .withIndex("by_entityTable_and_entityId", (q) =>
        q.eq("entityTable", "matchmakers").eq("entityId", matchmaker._id),
      )
      .order("desc")
      .take(MAX_PROFILE_HISTORY);
    return events.map((event) => ({
      _id: event._id,
      _creationTime: event._creationTime,
      action: event.action,
      changes: event.changes ?? [],
    }));
  },
});
