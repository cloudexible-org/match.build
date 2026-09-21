/**
 * Writing the assistant's drafted replies, and answering them
 * (prd/phase-2.md §4A).
 *
 * Two audiences. The internal mutations are the drafting job's own write path —
 * scheduling, recording, going stale — reachable from the action and from
 * nowhere a browser can go. The public ones are the matchmaker answering a
 * card: sending a draft, or turning it down.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "../_generated/server";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { appendMessage, conversationFor } from "../messages/helpers";
import { messageBodyError, normaliseMessageBody } from "../messages/rules";
import { scheduleMessageNotifications } from "../notifications/helpers";
import { debounceSeconds } from "./helpers";

/**
 * Everything waiting on this conversation stops being an answer.
 *
 * Called when the thread moves — a new message from either side, or a draft
 * sent — because a draft written for seq 7 is not a reply to seq 8. Marked
 * rather than deleted: what was offered and passed over is worth more than
 * the row costs, and `sent` needs somewhere to have come from.
 */
export async function staleDrafts(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  now: number,
  except?: Id<"replySuggestions">,
): Promise<number> {
  const open = await ctx.db
    .query("replySuggestions")
    .withIndex("by_conversationId_and_status", (q) =>
      q.eq("conversationId", conversationId).eq("status", "ready"),
    )
    .collect();
  let stale = 0;
  for (const draft of open) {
    if (draft._id === except) continue;
    await ctx.db.patch("replySuggestions", draft._id, {
      status: "stale",
      resolvedAt: now,
    });
    stale += 1;
  }
  return stale;
}

/**
 * The debounce (prd/phase-2.md §4A): draft a few seconds after the last
 * message, so somebody typing in bursts produces one generation rather than
 * four.
 *
 * The job already pending is cancelled and replaced, which is what makes the
 * window slide rather than fire on the first message of a burst. Cancelling a
 * job that has already run is a no-op, so the race is harmless.
 *
 * Called from `messages/mutations.ts` on every send. It schedules
 * unconditionally and the action decides whether there is anything to do —
 * a mutation cannot see whether the AI is on without reading deployment env,
 * and a scheduled job that returns immediately is cheaper than the coupling.
 */
export async function scheduleDraft(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
): Promise<void> {
  if (conversation.draftJobId !== undefined) {
    await ctx.scheduler.cancel(conversation.draftJobId);
  }
  const jobId = await ctx.scheduler.runAfter(
    debounceSeconds() * 1000,
    internal.replySuggestions.actions.draft,
    { conversationId: conversation._id },
  );
  await ctx.db.patch("conversations", conversation._id, {
    draftJobId: jobId,
  });
}

/**
 * The drafts one generation produced, and how much of the world the agent has
 * now been told about.
 *
 * One mutation for the whole batch: three drafts from one call have to land
 * together, or a matchmaker sees one card, then two more, and wonders which
 * arrived first.
 */
export const record = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    threadId: v.string(),
    bodies: v.array(v.string()),
    model: v.string(),
    throughSeq: v.number(),
    briefedVoiceAt: v.number(),
    briefedProfileAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation === null) return null;
    const now = Date.now();

    // The thread moved while the model was thinking, so these drafts answer a
    // question nobody is asking any more. The briefing marks still advance —
    // the agent really was told — and the next run picks up from there.
    const current = conversation.lastSeq === args.throughSeq;

    for (const body of args.bodies) {
      await ctx.db.insert("replySuggestions", {
        matchmakerId: conversation.matchmakerId,
        candidateId: conversation.candidateId,
        conversationId: conversation._id,
        body,
        model: args.model,
        throughSeq: args.throughSeq,
        status: current ? "ready" : "stale",
        createdAt: now,
        resolvedAt: current ? undefined : now,
      });
    }

    await ctx.db.patch("conversations", conversation._id, {
      agentThreadId: args.threadId,
      agentBriefedSeq: args.throughSeq,
      agentBriefedVoiceAt: args.briefedVoiceAt,
      agentBriefedProfileAt: args.briefedProfileAt,
      draftJobId: undefined,
    });
    return null;
  },
});

/** The job finished with nothing to record, so the debounce slot is freed. */
export const clearJob = internalMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation === null) return null;
    await ctx.db.patch("conversations", conversation._id, {
      draftJobId: undefined,
    });
    return null;
  },
});

/*
 * ─── The matchmaker answering a card ────────────────────────────────────────
 */

/**
 * Send a draft, as written or after an edit.
 *
 * The message is theirs: it goes out under their name, in the ordinary thread,
 * and the candidate cannot tell. `source: "ai_suggestion"` records how it
 * started — not who is answerable for it, which is the person who pressed
 * Send. An edited draft is still one: the draft is what got them there.
 */
export const send = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    suggestionId: v.id("replySuggestions"),
    /** The edited text, where they changed it before sending. */
    body: v.optional(v.string()),
  },
  returns: v.object({ seq: v.number() }),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const draft = await ctx.db.get("replySuggestions", args.suggestionId);
    assertSameTenant(draft, matchmaker._id);
    if (draft.status !== "ready") {
      throw new ConvexError("That suggestion has already been answered.");
    }

    const candidate = await ctx.db.get("candidates", draft.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    if (candidate.membership !== "joined") {
      throw new ConvexError(
        "They aren't a member any more, so the conversation is closed.",
      );
    }

    const body = args.body ?? draft.body;
    const invalid = messageBodyError(body);
    if (invalid) throw new ConvexError(invalid);

    const now = Date.now();
    const conversation = await conversationFor(ctx, candidate._id);
    const { messageId, seq } = await appendMessage(ctx, {
      conversation,
      author: "matchmaker",
      authorUserId: user._id,
      visibility: "everyone",
      source: "ai_suggestion",
      body: normaliseMessageBody(body),
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

    // The one they sent, then the alternatives they passed over.
    await ctx.db.patch("replySuggestions", draft._id, {
      status: "sent",
      resolvedAt: now,
      sentMessageId: messageId,
    });
    await staleDrafts(ctx, conversation._id, now, draft._id);
    return { seq };
  },
});

/**
 * Turn a draft down. Only this one: the others are still on offer, which is
 * the whole point of offering three.
 */
export const dismiss = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    suggestionId: v.id("replySuggestions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const draft = await ctx.db.get("replySuggestions", args.suggestionId);
    assertSameTenant(draft, matchmaker._id);
    if (draft.status !== "ready") return null;
    await ctx.db.patch("replySuggestions", draft._id, {
      status: "dismissed",
      resolvedAt: Date.now(),
    });
    return null;
  },
});
