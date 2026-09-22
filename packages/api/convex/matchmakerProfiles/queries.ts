/**
 * Reading a matchmaker's own profile (prd/phase-2.md §4.1C). Theirs alone:
 * `requireMatchmaker` proves the signed-in account owns the workspace, and
 * nothing else — no candidate, no other matchmaker — has a route here.
 */

import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { requireMatchmaker } from "../matchmakers/helpers";
import { aiFunctionStates } from "../replySuggestions/rules";
import { profileEntry } from "../schema";
import { matchmakerProfileFor, voiceSampleMessages } from "./helpers";

export const get = query({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.object({
    voice: v.union(profileEntry, v.null()),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const profile = await matchmakerProfileFor(ctx, matchmaker._id);
    return {
      voice: profile?.voice ?? null,
      updatedAt: profile?.updatedAt ?? 0,
    };
  },
});

/*
 * ─── The voice agent's context (prd/phase-2.md §4.1C) ───────────────────────
 */

/**
 * What the voice run reads: who they are, what they have said about how they
 * write, and the messages they have actually sent.
 *
 * Internal, and called from an action, so it answers to no signed-in account.
 * It is reached only from `actions.ts`, which is scheduled only by
 * `noteSentMessage` — from inside a mutation that has already proved the
 * caller owns this workspace.
 *
 * **Only `typed` messages.** An imported one is the candidate's earlier
 * conversation pasted in at onboarding: it is in this matchmaker's book and
 * some of it is in their voice, but some of it is the candidate's, and a
 * voice profile built partly from the person being written to would be worse
 * than no voice profile.
 */
export const voiceContext = internalQuery({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.union(
    v.null(),
    v.object({
      matchmakerName: v.string(),
      current: v.string(),
      samples: v.array(v.object({ body: v.string(), sentAt: v.number() })),
    }),
  ),
  handler: async (ctx, { matchmakerId }) => {
    const matchmaker = await ctx.db.get("matchmakers", matchmakerId);
    if (matchmaker === null) return null;

    const every = voiceSampleMessages();
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_matchmakerId_and_author_and_sentAt", (q) =>
        q.eq("matchmakerId", matchmakerId).eq("author", "matchmaker"),
      )
      .order("desc")
      // Twice the cadence, so a run reads the window it was woken for and the
      // one before it: a voice distilled from only the newest twenty messages
      // would swing with whatever kind of week they have just had.
      .take(every * 2);

    // Conversations this matchmaker has switched voice off on. Read once per
    // distinct conversation in the window rather than per message — the window
    // is `every * 2` messages over a handful of threads — and applied
    // retroactively: turning the switch off is meant to take what was already
    // typed there out of the sample, not merely stop the next message going
    // in. Without this the switch would only bite on a conversation that had
    // no history when it was flipped.
    const voiceOffIds = new Set<string>();
    for (const conversationId of new Set(recent.map((m) => m.conversationId))) {
      const conversation = await ctx.db.get("conversations", conversationId);
      if (conversation !== null && !aiFunctionStates(conversation).voice) {
        voiceOffIds.add(conversationId);
      }
    }

    const samples = recent
      .filter(
        (message) =>
          message.source === "typed" &&
          !voiceOffIds.has(message.conversationId),
      )
      .map((message) => ({ body: message.body, sentAt: message.sentAt }))
      .reverse(); // oldest first, the way they wrote them
    if (samples.length === 0) return null;

    const profile = await matchmakerProfileFor(ctx, matchmakerId);
    return {
      matchmakerName: matchmaker.displayName,
      current: profile?.voice?.value ?? "",
      samples,
    };
  },
});
