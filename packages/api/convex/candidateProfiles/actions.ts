/*
 * The reconciling run (prd/phase-2.md §4.1B): what the conversation agent
 * noticed, turned into entries the registry can actually hold.
 *
 * **Deliberately not `"use node"`**, for the reason `ai/actions.ts` sets out at
 * length: a local anonymous backend cannot run Node actions, so one such file
 * fails the whole push and every Convex-backed spec then runs against stale
 * functions (`AGENTS.md` §8).
 *
 * ─── Two agents, two jobs, one after the other ──────────────────────────────
 *
 * The conversation agent read the thread and said what it saw, in its own
 * words, with the candidate's words beside it. This run hands that to the
 * profile agent, which knows the registry and knows what is already on the
 * record, and asks a narrower question: what should be stored, under which
 * key, and is it new?
 *
 * It does **not** ask whether to write or to propose. That is the field's
 * policy and it is applied by `applyAgentEntries` — an agent that could choose
 * would make the policy advisory.
 *
 * ─── The thread is its own ──────────────────────────────────────────────────
 *
 * A second thread per conversation, not the drafting one. A drafting thread's
 * history is the context the next draft is written in, and a turn spent
 * arguing about registry keys is not something a reply should be written in
 * the shadow of. The cost is one extra briefing; the benefit is that neither
 * agent's context is the other's leftovers.
 */

import { Agent } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { MAX_NOTICED, type NoticedFact } from "../replySuggestions/rules";
import {
  parseReconciled,
  profileOpeningBrief,
  profileUpdateBrief,
  reconcileInstruction,
} from "./rules";

/**
 * Turn what was noticed in one conversation into profile entries.
 *
 * Every way out of here is quiet, exactly as the drafting run's are. The agent
 * may be off, the deployment may have no gateway, the conversation's switch
 * may have gone off while the model was thinking, the model may refuse — and
 * in all of them the profile simply does not change, which is the phase-1 app
 * the matchmaker already knows how to use (prd/phase-2.md, Principle). A
 * failure here must never be a failure to send a message, and it must never
 * be a failure to *draft* one either: this is scheduled from the drafting run
 * rather than awaited inside it.
 */
export const reconcile = internalAction({
  args: {
    conversationId: v.id("conversations"),
    noticed: v.array(v.object({ observation: v.string(), quote: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { conversationId, noticed }): Promise<null> => {
    if (noticed.length === 0) return null;

    const settings = await ctx.runQuery(internal.ai.queries.active, {
      agent: "candidate_profile",
    });
    if (settings === null) return null;

    const context = await ctx.runQuery(
      internal.candidateProfiles.queries.reconcileContext,
      { conversationId },
    );
    // No conversation, no candidate, or the matchmaker turned this one off.
    if (context === null) return null;

    const first = context.threadId === null;
    const parts: string[] = [];
    if (first) {
      parts.push(profileOpeningBrief(context.candidateName, context.state));
    } else {
      const update = profileUpdateBrief(context.state);
      if (update !== null) parts.push(update);
    }
    // Capped on the way in as well as on the way out of the parser: this is
    // the one place where a model's output becomes another model's input, and
    // a generation that wrote two hundred lines should not buy itself a
    // two-hundred-line prompt.
    parts.push(
      reconcileInstruction(
        context.candidateName,
        noticed.slice(0, MAX_NOTICED) satisfies NoticedFact[],
      ),
    );

    const agent = new Agent(components.agent, {
      name: "candidate_profile",
      languageModel: convexGateway(settings.model),
      instructions: settings.systemPrompt,
    });

    try {
      const threadId =
        context.threadId ??
        (
          await agent.createThread(ctx, {
            title: `Profile · ${context.candidateName}`,
          })
        ).threadId;

      // Before the generation's own output, so a thread the component has
      // already created is never left with nothing pointing at it — `ctx.db`
      // cannot see the component's tables, so a thread nothing references is
      // a thread an erasure cannot reach.
      await ctx.runMutation(
        internal.candidateProfiles.mutations.rememberProfileThread,
        { conversationId, threadId, briefedAt: context.profileAt },
      );

      const { text } = await agent.generateText(
        ctx,
        { threadId },
        {
          prompt: parts.join("\n\n"),
          maxOutputTokens: settings.maxOutputTokens,
        },
      );

      const entries = parseReconciled(text);
      if (entries.length === 0) return null;

      await ctx.runMutation(
        internal.candidateProfiles.mutations.applyAgentEntries,
        {
          candidateId: context.candidateId,
          agent: "candidate_profile",
          model: settings.model,
          entries: entries.map((entry) => ({
            kind: entry.kind,
            key: entry.key,
            action:
              entry.value === undefined ? ("clear" as const) : ("set" as const),
            value: entry.value,
            confidence: entry.confidence,
            sourceQuote: entry.quote,
          })),
        },
      );
    } catch {
      // Silently, on purpose. A profile that did not grow this minute is the
      // product working; an error surfaced into a matchmaker's conversation
      // about something they never asked for is not.
      return null;
    }
    return null;
  },
});
