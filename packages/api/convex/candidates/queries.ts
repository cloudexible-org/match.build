import { v } from "convex/values";
import { query } from "../_generated/server";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { socialPlatform } from "../schema";

const membership = v.union(
  v.literal("invited"),
  v.literal("declined"),
  v.literal("joined"),
  v.literal("left"),
  v.literal("account_deleted"),
);
const candidateStatus = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("archived"),
);

// The workspace list reads the most recent conversations only. Far above a
// phase-1 book; paging comes when a matchmaker gets near it.
const MAX_LISTED = 300;

/**
 * The workspace's candidate list (prd/phase-1.md §4.1): one row per
 * candidate with the given status, most recent conversation first.
 *
 * `name` is the matchmaker's label for the candidate, falling back to the
 * linked account's name once they've joined; the app falls back to `email`.
 */
export const list = query({
  args: { matchmakerId: v.id("matchmakers"), status: candidateStatus },
  returns: v.array(
    v.object({
      candidateId: v.id("candidates"),
      name: v.optional(v.string()),
      email: v.string(),
      membership,
      lastMessageAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_matchmakerId_and_lastMessageAt", (q) =>
        q.eq("matchmakerId", matchmaker._id),
      )
      .order("desc")
      .take(MAX_LISTED);

    const rows = [];
    for (const conversation of conversations) {
      const candidate = await ctx.db.get(
        "candidates",
        conversation.candidateId,
      );
      if (candidate === null || candidate.status !== args.status) continue;
      let name = candidate.name;
      if (name === undefined && candidate.userId !== undefined) {
        name = (await ctx.db.get("users", candidate.userId))?.name;
      }
      rows.push({
        candidateId: candidate._id,
        name,
        email: candidate.email,
        membership: candidate.membership,
        lastMessageAt: conversation.lastMessageAt,
      });
    }
    return rows;
  },
});

// The newest messages the conversation view loads. Scrollback paging arrives
// with chat (step 5).
const MAX_MESSAGES = 100;

/**
 * One candidate's conversation as the matchmaker sees it: the candidate's
 * details and invite state, and the latest messages of every visibility,
 * oldest first. Private messages are the matchmaker's own; nothing here is
 * ever returned to a candidate.
 */
export const conversation = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
  },
  returns: v.object({
    candidate: v.object({
      candidateId: v.id("candidates"),
      name: v.optional(v.string()),
      email: v.string(),
      socialHandles: v.array(
        v.object({ platform: socialPlatform, handle: v.string() }),
      ),
      membership,
      membershipChangedAt: v.number(),
      invite: v.union(
        v.null(),
        v.object({ expiresAt: v.number(), copyable: v.boolean() }),
      ),
    }),
    messages: v.array(
      v.object({
        _id: v.id("messages"),
        seq: v.number(),
        author: v.union(
          v.literal("matchmaker"),
          v.literal("candidate"),
          v.literal("system"),
        ),
        visibility: v.union(v.literal("everyone"), v.literal("matchmaker")),
        source: v.union(
          v.literal("typed"),
          v.literal("imported"),
          v.literal("system"),
        ),
        body: v.string(),
        sentAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);

    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_candidateId", (q) => q.eq("candidateId", candidate._id))
      .unique();
    const messages =
      conversation === null
        ? []
        : await ctx.db
            .query("messages")
            .withIndex("by_conversationId_and_seq", (q) =>
              q.eq("conversationId", conversation._id),
            )
            .order("desc")
            .take(MAX_MESSAGES);

    let name = candidate.name;
    if (name === undefined && candidate.userId !== undefined) {
      name = (await ctx.db.get("users", candidate.userId))?.name;
    }
    return {
      candidate: {
        candidateId: candidate._id,
        name,
        email: candidate.email,
        socialHandles: candidate.socialHandles,
        membership: candidate.membership,
        membershipChangedAt: candidate.membershipChangedAt,
        invite:
          candidate.invite === undefined
            ? null
            : {
                expiresAt: candidate.invite.expiresAt,
                copyable: candidate.invite.nonce !== undefined,
              },
      },
      messages: messages.reverse().map((message) => ({
        _id: message._id,
        seq: message.seq,
        author: message.author,
        visibility: message.visibility,
        source: message.source,
        body: message.body,
        sentAt: message.sentAt,
      })),
    };
  },
});
