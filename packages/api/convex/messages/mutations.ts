import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCandidateSelf } from "../candidates/helpers";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { scheduleMessageNotifications } from "../notifications/helpers";
import { advanceReadMarker, appendMessage, conversationFor } from "./helpers";
import { messageBodyError, normaliseMessageBody } from "./rules";

/**
 * Sending and reading messages (prd/phase-1.md §3.3). Both sides see new
 * messages through Convex's own subscriptions, so nothing here pushes.
 */

/**
 * The matchmaker writes to a candidate. Only while they're a member: before
 * that (invited, declined) and after it (left, account deleted) the thread is
 * readable but closed, as the composer is in the UI.
 */
export const send = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    body: v.string(),
  },
  returns: v.object({ seq: v.number() }),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    if (candidate.membership !== "joined") {
      throw new ConvexError(
        candidate.membership === "invited"
          ? "You can message them once they accept your invitation."
          : "They aren't a member any more, so the conversation is closed.",
      );
    }
    const invalid = messageBodyError(args.body);
    if (invalid) throw new ConvexError(invalid);

    const now = Date.now();
    const conversation = await conversationFor(ctx, candidate._id);
    const { seq } = await appendMessage(ctx, {
      conversation,
      author: "matchmaker",
      authorUserId: user._id,
      visibility: "everyone",
      source: "typed",
      body: normaliseMessageBody(args.body),
      now,
    });
    await scheduleMessageNotifications(ctx, {
      conversation,
      candidate,
      author: "matchmaker",
      visibility: "everyone",
      seq,
      now,
    });
    return { seq };
  },
});

/** The candidate writes back. Only their own conversation, only as a member. */
export const sendAsCandidate = mutation({
  args: { candidateId: v.id("candidates"), body: v.string() },
  returns: v.object({ seq: v.number() }),
  handler: async (ctx, args) => {
    const { user, candidate } = await requireCandidateSelf(
      ctx,
      args.candidateId,
    );
    const invalid = messageBodyError(args.body);
    if (invalid) throw new ConvexError(invalid);

    const now = Date.now();
    const conversation = await conversationFor(ctx, candidate._id);
    const { seq } = await appendMessage(ctx, {
      conversation,
      author: "candidate",
      authorUserId: user._id,
      visibility: "everyone",
      source: "typed",
      body: normaliseMessageBody(args.body),
      now,
    });
    await scheduleMessageNotifications(ctx, {
      conversation,
      candidate,
      author: "candidate",
      visibility: "everyone",
      seq,
      now,
    });
    return { seq };
  },
});

/**
 * The matchmaker has seen up to `seq` (prd §8.1: the conversation is open and
 * the tab is visible). Drives the unread indicator, and decides which
 * scheduled notifications are skipped when their job fires
 * (`notifications/mutations.ts`).
 */
export const markRead = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    seq: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    const conversation = await conversationFor(ctx, candidate._id);
    const matchmakerLastReadSeq = advanceReadMarker(
      conversation.matchmakerLastReadSeq,
      args.seq,
      conversation.lastSeq,
    );
    if (matchmakerLastReadSeq !== conversation.matchmakerLastReadSeq) {
      await ctx.db.patch("conversations", conversation._id, {
        matchmakerLastReadSeq,
      });
    }
    return null;
  },
});

/** The candidate has seen up to `seq`, of the messages they can see. */
export const markReadAsCandidate = mutation({
  args: { candidateId: v.id("candidates"), seq: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { candidate } = await requireCandidateSelf(ctx, args.candidateId);
    const conversation = await conversationFor(ctx, candidate._id);
    const candidateLastReadSeq = advanceReadMarker(
      conversation.candidateLastReadSeq,
      args.seq,
      conversation.lastPublicSeq,
    );
    if (candidateLastReadSeq !== conversation.candidateLastReadSeq) {
      await ctx.db.patch("conversations", conversation._id, {
        candidateLastReadSeq,
      });
    }
    return null;
  },
});
