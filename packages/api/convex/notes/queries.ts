import { v } from "convex/values";
import { query } from "../_generated/server";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";

// A candidate's notes. Far above what anyone writes about one person.
const MAX_NOTES = 200;

/**
 * A candidate's notes, newest first. Removed ones are left out: the History
 * tab is where their removal is recorded.
 */
export const list = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
  },
  returns: v.array(
    v.object({
      _id: v.id("notes"),
      body: v.string(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_candidateId", (q) => q.eq("candidateId", candidate._id))
      .order("desc")
      .take(MAX_NOTES);
    return notes
      .filter((note) => note.removedAt === undefined)
      .map((note) => ({
        _id: note._id,
        body: note.body,
        updatedAt: note.updatedAt,
      }));
  },
});
