import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { getCurrentUser } from "../users/helpers";
import { currentInviteToken, inviteProblem, resolveInvite } from "./helpers";

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

/**
 * What the accept screen shows for an invite link (`token`) or a home-page
 * invitation (`candidateId`), for the signed-in account.
 *
 * `invalid` covers unknown, used, revoked and expired alike. `problem` says
 * why this account can't accept an otherwise open invite (see
 * `inviteProblem`). Only the matchmaker's display name is revealed: never
 * the invited email or anything the matchmaker knows.
 */
export const preview = query({
  args: {
    token: v.optional(v.string()),
    candidateId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ state: v.literal("invalid") }),
    v.object({
      state: v.literal("open"),
      matchmakerDisplayName: v.string(),
      problem: v.union(
        v.null(),
        v.literal("own_profile"),
        v.literal("already_member"),
        v.literal("other_history"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return { state: "invalid" as const };
    const candidate = await resolveInvite(ctx, user, args);
    if (candidate === null) return { state: "invalid" as const };
    const matchmaker = await ctx.db.get("matchmakers", candidate.matchmakerId);
    if (matchmaker === null) return { state: "invalid" as const };
    return {
      state: "open" as const,
      matchmakerDisplayName: matchmaker.displayName,
      problem: await inviteProblem(ctx, user, candidate),
    };
  },
});

/**
 * What the invite email needs, for `invites.actions.sendEmail` — or `null`
 * when the invite it was scheduled for is no longer the open one.
 */
export const emailDetails = internalQuery({
  args: { candidateId: v.id("candidates"), tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      to: v.string(),
      matchmakerName: v.string(),
      nonce: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get("candidates", args.candidateId);
    const invite = candidate?.invite;
    if (
      candidate === null ||
      invite === undefined ||
      invite.tokenHash !== args.tokenHash ||
      invite.nonce === undefined
    ) {
      return null;
    }
    const matchmaker = await ctx.db.get("matchmakers", candidate.matchmakerId);
    if (matchmaker === null) return null;
    return {
      to: candidate.email,
      matchmakerName: matchmaker.displayName,
      nonce: invite.nonce,
      expiresAt: invite.expiresAt,
    };
  },
});
