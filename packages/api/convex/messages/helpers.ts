import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Writing to a conversation (prd/phase-1.md §3.3). Messages are not audited
 * (§5.1): the thread is its own record.
 */

/** A candidate's conversation, or throw. Every candidate has exactly one. */
export async function conversationFor(
  ctx: QueryCtx,
  candidateId: Id<"candidates">,
): Promise<Doc<"conversations">> {
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
    .unique();
  if (conversation === null) throw new ConvexError("Conversation not found.");
  return conversation;
}

/**
 * Appends one message and moves the conversation's counters with it: the
 * sequence (allocated here, so it stays monotonic), the last public sequence
 * when the candidate can see it, the ordering timestamp, and the sender's own
 * read marker — you have read what you just sent.
 */
export async function appendMessage(
  ctx: MutationCtx,
  args: {
    conversation: Doc<"conversations">;
    author: "matchmaker" | "candidate" | "system";
    authorUserId?: Id<"users">;
    visibility: "everyone" | "matchmaker";
    source: "typed" | "imported" | "system";
    body: string;
    now: number;
  },
): Promise<{ messageId: Id<"messages">; seq: number }> {
  const { conversation } = args;
  const seq = conversation.lastSeq + 1;
  const messageId = await ctx.db.insert("messages", {
    matchmakerId: conversation.matchmakerId,
    conversationId: conversation._id,
    seq,
    author: args.author,
    authorUserId: args.authorUserId,
    visibility: args.visibility,
    source: args.source,
    body: args.body,
    sentAt: args.now,
  });
  await ctx.db.patch("conversations", conversation._id, {
    lastSeq: seq,
    lastPublicSeq:
      args.visibility === "everyone" ? seq : conversation.lastPublicSeq,
    lastMessageAt: args.now,
    ...(args.author === "matchmaker" ? { matchmakerLastReadSeq: seq } : {}),
    ...(args.author === "candidate" ? { candidateLastReadSeq: seq } : {}),
  });
  return { messageId, seq };
}

/**
 * Moves a read marker forward, never back, and never past what that side can
 * actually see. The client says which sequence it has displayed; a stale or
 * hopeful number can't rewind the marker or mark unseen messages read.
 */
export function advanceReadMarker(
  current: number,
  claimed: number,
  visibleUpTo: number,
): number {
  return Math.max(current, Math.min(claimed, visibleUpTo));
}

/** One message as the app sees it: no row ids beyond the message's own. */
export function publicMessage(message: Doc<"messages">) {
  return {
    _id: message._id,
    seq: message.seq,
    author: message.author,
    visibility: message.visibility,
    source: message.source,
    body: message.body,
    sentAt: message.sentAt,
  };
}
