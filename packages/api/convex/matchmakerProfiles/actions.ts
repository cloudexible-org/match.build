/*
 * The voice run (prd/phase-2.md §4.1C): what a matchmaker's own messages say
 * about how they write.
 *
 * **Deliberately not `"use node"`**, for the reason `ai/actions.ts` sets out at
 * length (`AGENTS.md` §8).
 *
 * ─── No thread, on purpose ──────────────────────────────────────────────────
 *
 * The other two agents keep one: a conversation is continuous and re-sending
 * it every time would pay twice for context the thread already holds. This one
 * runs once every `AI_VOICE_SAMPLE_MESSAGES` messages over a window it reads
 * fresh each time, and has nothing to remember between runs that the profile
 * does not already hold. A thread would be a second copy of a matchmaker's
 * writing, in tables `ctx.db` cannot see, kept for no gain.
 *
 * ─── It proposes, always ────────────────────────────────────────────────────
 *
 * `VOICE_FIELD.policy` is `suggest`, so `applyAgentVoice` turns whatever comes
 * out of here into a suggestion sitting beside their own words rather than
 * over them. How someone writes is theirs; this only ever offers a draft.
 */

import { Agent } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { recordUsage } from "../aiUsage/helpers";
import { parseVoice, voiceInstruction } from "./rules";

/**
 * Distil one matchmaker's voice from what they have written.
 *
 * Quiet on every path out, like the other two: the agent may be off, the
 * deployment may have no gateway, the model may refuse — and in all of them
 * the matchmaker's voice stays exactly as they left it, which is the product
 * working rather than failing (prd/phase-2.md, Principle).
 */
export const distil = internalAction({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.null(),
  handler: async (ctx, { matchmakerId }): Promise<null> => {
    const settings = await ctx.runQuery(internal.ai.queries.active, {
      agent: "voice_profile",
    });
    if (settings === null) return null;

    const context = await ctx.runQuery(
      internal.matchmakerProfiles.queries.voiceContext,
      { matchmakerId },
    );
    // No matchmaker, or nothing they typed themselves to read.
    if (context === null) return null;

    const agent = new Agent(components.agent, {
      name: "voice_profile",
      languageModel: convexGateway(settings.model),
      instructions: settings.systemPrompt,
    });

    try {
      // A fresh thread per run, deleted as soon as the run is done: the
      // component's API is per thread, and one that outlived the run would be
      // a copy of this matchmaker's writing that nothing points at.
      const { threadId } = await agent.createThread(ctx, {
        title: `Voice · ${context.matchmakerName}`,
      });
      try {
        const { text, usage } = await agent.generateText(
          ctx,
          { threadId },
          {
            prompt: voiceInstruction(
              context.matchmakerName,
              context.current,
              context.samples,
            ),
            maxOutputTokens: settings.maxOutputTokens,
          },
        );

        // Attributed by matchmaker rather than by conversation: this run reads
        // their whole book and belongs to no one thread. Recorded before the
        // parse, because a voice this run could not read out of the text cost
        // the same as one it could. `recordUsage` never throws.
        await recordUsage(ctx, {
          agent: "voice_profile",
          model: settings.model,
          usage,
          matchmakerId,
        });

        const voice = parseVoice(text);
        if (voice === null) return null;

        await ctx.runMutation(
          internal.matchmakerProfiles.mutations.applyAgentVoice,
          {
            matchmakerId,
            agent: "voice_profile",
            model: settings.model,
            value: voice,
          },
        );
      } finally {
        await ctx.runMutation(
          components.agent.threads.deleteAllForThreadIdAsync,
          { threadId },
        );
      }
    } catch {
      // Silently. A voice that did not change this week is not a failure a
      // matchmaker needs told about, and `noteSentMessage` has already moved
      // the mark, so the next window is the next attempt.
      return null;
    }
    return null;
  },
});
