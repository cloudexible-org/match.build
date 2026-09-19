import { v } from "convex/values";
import { query } from "../_generated/server";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { currentInviteToken } from "./helpers";

/**
 * The token of a candidate's open invite, for the owner's **Copy invite
 * link** (prd/phase-1.md §3.1). The app turns it into a URL on its own
 * origin. `null` when there is no open invite, or it can't be copied.
 */
export const token = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    return await currentInviteToken(candidate);
  },
});
