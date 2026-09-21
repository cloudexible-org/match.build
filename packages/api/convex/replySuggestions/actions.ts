/*
 * The drafting run (prd/phase-2.md §4A): one call to the conversation agent,
 * a few seconds after the last message.
 *
 * **Deliberately not `"use node"`**, for the reason `ai/actions.ts` sets out at
 * length: a local anonymous backend cannot run Node actions, so one such file
 * fails the whole push and every Convex-backed spec then runs against stale
 * functions (`AGENTS.md` §8). Actions only, so nothing here shares a file with
 * a query or a mutation.
 *
 * ─── The agent is briefed once, then kept up to date ────────────────────────
 *
 * A conversation gets one agent thread, and the thread is the memory. The
 * first run sends everything — voice, profile, notes, the recent thread. Every
 * run after it sends only what has changed since: the new messages, a voice
 * that has been rewritten, profile entries that have moved. Re-sending the
 * world each time would be paying twice for something the thread already
 * holds, and would bury the new message in a wall of text the model has read
 * four times already.
 */

import { Agent } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { DraftContext } from "./queries";
import {
  draftInstruction,
  openingBrief,
  parseDrafts,
  updateBrief,
  voiceUpdate,
} from "./rules";

/**
 * Draft replies for one conversation.
 *
 * Every way out of here is quiet. The agent may be off, the deployment may
 * have no gateway, the thread may have moved on, the model may refuse or
 * fail — and in all of them the matchmaker simply has no drafts, which is the
 * phase-1 app they already know how to use (prd/phase-2.md, Principle). A
 * failure here must never be a failure to send a message.
 */
export const draft = internalAction({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, { conversationId }): Promise<null> => {
    const context: DraftContext | null = await ctx.runQuery(
      internal.replySuggestions.queries.draftContext,
      { conversationId },
    );
    // No conversation, nobody to draft for, or the agent is off.
    if (context === null) {
      await ctx.runMutation(internal.replySuggestions.mutations.clearJob, {
        conversationId,
      });
      return null;
    }

    const { brief, settings, briefedThrough, voiceAt, profileAt, throughSeq } =
      context;
    const first = context.threadId === null;

    // The first run tells it everything; every run after it, only the news.
    const parts: string[] = [];
    if (first) {
      parts.push(openingBrief(brief));
    } else {
      const voice = voiceUpdate(brief, briefedThrough, voiceAt);
      if (voice !== null) parts.push(voice);
      const update = updateBrief(brief, briefedThrough);
      if (update !== null) parts.push(update);
      // Nothing has happened since the last draft. This is reachable: the
      // matchmaker's own reply schedules a run too, and if the drafts from
      // last time are still open there is nothing new to say.
      if (parts.length === 0) {
        await ctx.runMutation(internal.replySuggestions.mutations.clearJob, {
          conversationId,
        });
        return null;
      }
    }
    parts.push(draftInstruction(context.count, brief.candidateName));

    const agent = new Agent(components.agent, {
      name: "conversation",
      languageModel: convexGateway(settings.model),
      instructions: settings.systemPrompt,
    });

    try {
      // From an action `createThread` hands back the thread as well as its id;
      // only the id outlives this run.
      const threadId =
        context.threadId ??
        (
          await agent.createThread(ctx, {
            title: `${brief.matchmakerName} · ${brief.candidateName}`,
          })
        ).threadId;

      const { text } = await agent.generateText(
        ctx,
        { threadId },
        {
          prompt: parts.join("\n\n"),
          maxOutputTokens: settings.maxOutputTokens,
        },
      );

      await ctx.runMutation(internal.replySuggestions.mutations.record, {
        conversationId,
        threadId,
        bodies: parseDrafts(text, context.count),
        model: settings.model,
        throughSeq,
        briefedVoiceAt: voiceAt,
        briefedProfileAt: profileAt,
      });
    } catch (error) {
      // Logged, not thrown, and not surfaced: a matchmaker who was never
      // promised a draft has not lost one, and an error banner over the
      // composer would be worse than the silence.
      console.error(
        `Reply drafting failed for ${conversationId}:`,
        error instanceof Error ? error.message : String(error),
      );
      await ctx.runMutation(internal.replySuggestions.mutations.clearJob, {
        conversationId,
      });
    }
    return null;
  },
});
