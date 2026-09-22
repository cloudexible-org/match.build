import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireMatchmaker } from "../matchmakers/helpers";
import { usernameKey } from "../matchmakers/rules";
import { socialPlatform } from "../schema";
import { getCurrentUser } from "../users/helpers";

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
      /** Messages this matchmaker hasn't read, of any visibility. */
      unread: v.number(),
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
        unread: conversation.lastSeq - conversation.matchmakerLastReadSeq,
      });
    }
    return rows;
  },
});

/**
 * One candidate's conversation as the matchmaker sees it: who they are, and
 * where their membership and invitation stand. The thread itself is paged
 * separately (`messages.queries.thread`), so a new message doesn't re-send
 * the candidate's details.
 *
 * `candidateId` comes from the URL, so it is taken as a string: a malformed
 * id, an unknown one and another tenant's all answer `null` alike.
 */
export const conversation = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      candidate: v.object({
        candidateId: v.id("candidates"),
        name: v.optional(v.string()),
        email: v.string(),
        socialHandles: v.array(
          v.object({ platform: socialPlatform, handle: v.string() }),
        ),
        membership,
        membershipChangedAt: v.number(),
        status: candidateStatus,
        invite: v.union(
          v.null(),
          v.object({
            expiresAt: v.number(),
            lastSentAt: v.optional(v.number()),
            copyable: v.boolean(),
          }),
        ),
        // The linked account's email, when it differs from the invited one
        // ("Accepted as other@example.com", prd §3.2).
        acceptedAs: v.optional(v.string()),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidateId = ctx.db.normalizeId("candidates", args.candidateId);
    const candidate =
      candidateId === null ? null : await ctx.db.get("candidates", candidateId);
    if (candidate === null || candidate.matchmakerId !== matchmaker._id) {
      return null;
    }

    const account =
      candidate.userId === undefined
        ? null
        : await ctx.db.get("users", candidate.userId);
    const name = candidate.name ?? account?.name;
    return {
      candidate: {
        candidateId: candidate._id,
        name,
        email: candidate.email,
        socialHandles: candidate.socialHandles,
        membership: candidate.membership,
        membershipChangedAt: candidate.membershipChangedAt,
        status: candidate.status,
        invite:
          candidate.invite === undefined
            ? null
            : {
                expiresAt: candidate.invite.expiresAt,
                lastSentAt: candidate.invite.lastSentAt,
                copyable: candidate.invite.nonce !== undefined,
              },
        acceptedAs:
          account?.email !== undefined && account.email !== candidate.email
            ? account.email
            : undefined,
      },
    };
  },
});

/**
 * The signed-in account's membership with the matchmaker the `/c#username`
 * hash names, or `null` when it has none (never joined, left, or no such
 * matchmaker — alike). Candidate-facing: returns only what the candidate may
 * see, never the matchmaker's private data.
 *
 * The display name and `joinedAt` feed the candidate shell's third column
 * (prd/phase-1.md §4.2): who this matchmaker is, and since when.
 */
export const self = query({
  args: { matchmakerUsername: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      candidateId: v.id("candidates"),
      matchmakerUsername: v.string(),
      matchmakerDisplayName: v.string(),
      joinedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    const key = usernameKey(args.matchmakerUsername);
    if (!key) return null;
    const matchmaker = await ctx.db
      .query("matchmakers")
      .withIndex("by_usernameKey", (q) => q.eq("usernameKey", key))
      .first();
    if (matchmaker === null) return null;
    const rows = await ctx.db
      .query("candidates")
      .withIndex("by_userId_and_matchmakerId", (q) =>
        q.eq("userId", user._id).eq("matchmakerId", matchmaker._id),
      )
      .take(10);
    const joined = rows.find((row) => row.membership === "joined");
    if (joined === undefined) return null;
    return {
      candidateId: joined._id,
      matchmakerUsername: matchmaker.username,
      matchmakerDisplayName: matchmaker.displayName,
      joinedAt: joined.membershipChangedAt,
    };
  },
});
