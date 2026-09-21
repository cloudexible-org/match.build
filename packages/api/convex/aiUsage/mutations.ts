/**
 * The one write: a row per call that left this deployment for a model.
 *
 * Internal only. Nothing a browser can reach writes here — a public mutation
 * that inserted usage rows would let anyone with a session inflate our own cost
 * reporting, which is a strange thing to attack and a stranger one to leave
 * open.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { aiAgentId } from "../schema";
import { modelRate } from "./helpers";
import { dayKey, generationCostMicroUsd, storedTokens } from "./rules";

/**
 * Records one generation.
 *
 * **Priced at write time, not at read time.** The cost is computed from the rate
 * in force at the moment of the call and then stored, so correcting a rate today
 * cannot silently rewrite what last month is reported to have cost. The
 * arithmetic is in `rules.ts`; a model with no rate stores no cost at all rather
 * than a zero.
 *
 * **Not audited.** The audit trail is the record of changes to things a
 * matchmaker owns (prd/phase-1.md §5); this is telemetry about our own spend,
 * and an event per generation would bury the trail it was added to. A rate
 * *change* is audited, because that is somebody's decision rather than a
 * measurement.
 */
export const record = internalMutation({
  args: {
    agent: aiAgentId,
    model: v.string(),
    // Every count optional, in the shape AI SDK 7 reports them: a provider may
    // answer with the totals and none of the detail, or with nothing at all.
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    cachedInputTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    reasoningTokens: v.optional(v.number()),
    /** The conversation it was for; the tenant and candidate come from it. */
    conversationId: v.optional(v.id("conversations")),
    /** For a run with no conversation behind it, like the voice agent's. */
    matchmakerId: v.optional(v.id("matchmakers")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tokens = storedTokens({
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      inputTokenDetails: {
        cacheReadTokens: args.cachedInputTokens,
        cacheWriteTokens: args.cacheWriteTokens,
      },
      outputTokenDetails: { reasoningTokens: args.reasoningTokens },
    });

    // Derived rather than passed: the caller is an action that knows a
    // conversation id, and asking it to also pass the two ids hanging off that
    // row would be two more chances to attribute a cost to the wrong tenant.
    const conversation =
      args.conversationId === undefined
        ? null
        : await ctx.db.get("conversations", args.conversationId);

    const model = args.model.trim();
    const cost = generationCostMicroUsd(tokens, await modelRate(ctx, model));

    await ctx.db.insert("aiGenerations", {
      agent: args.agent,
      model,
      day: dayKey(Date.now()),
      ...tokens,
      costMicroUsd: cost ?? undefined,
      matchmakerId: conversation?.matchmakerId ?? args.matchmakerId,
      candidateId: conversation?.candidateId,
    });
    return null;
  },
});
