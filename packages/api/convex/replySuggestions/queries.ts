/**
 * Reading the drafted replies (prd/phase-2.md §4A).
 *
 * Two readers. `forCandidate` is the matchmaker's, and feeds the cards above
 * the composer. `draftContext` is the drafting action's, and is internal: it
 * gathers everything the agent is about to be told, which is the matchmaker's
 * notes and the candidate's whole profile, and nothing a browser asks for
 * should ever return that in one object.
 */

import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { type AgentSettings, activeAgent } from "../ai/helpers";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import {
  briefedThrough,
  briefFor,
  liveWindow,
  profileHighWater,
  readyDrafts,
  replyCount,
  voiceUpdatedAt,
} from "./helpers";
import type { Brief, BriefedThrough } from "./rules";

/**
 * The drafts waiting on one candidate, newest first.
 *
 * Matchmaker-only. A candidate has no route here, and there is no version of
 * this product where they do: these are drafts of messages addressed to them,
 * which they are meant to receive as their matchmaker's own words or not at
 * all.
 */
export const forCandidate = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
  },
  returns: v.array(
    v.object({
      _id: v.id("replySuggestions"),
      body: v.string(),
      model: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    const drafts = await readyDrafts(ctx, candidate._id);
    return drafts.map((draft) => ({
      _id: draft._id,
      body: draft.body,
      model: draft.model,
      createdAt: draft.createdAt,
    }));
  },
});

/**
 * Everything one drafting run needs, or `null` when there is nothing to do.
 *
 * Annotated rather than inferred: the action that calls this is reached
 * through `internal`, which includes the action itself, and TypeScript cannot
 * unwind that circle on its own (TS7022) — the same knot `ai/actions.ts` ties.
 */
export type DraftContext = {
  brief: Brief;
  settings: AgentSettings;
  briefedThrough: BriefedThrough;
  /** `null` until the agent has been briefed once. */
  threadId: string | null;
  /** The marks to record once this run has been told about them. */
  voiceAt: number;
  profileAt: number;
  /** The state of the thread these drafts answer. */
  throughSeq: number;
  count: number;
};

/** Mirrors `AgentSettings`; `ai/queries.ts` declares the same shape. */
const agentSettingsShape = {
  agent: v.union(
    v.literal("conversation"),
    v.literal("candidate_profile"),
    v.literal("voice_profile"),
  ),
  label: v.string(),
  does: v.string(),
  enabled: v.boolean(),
  model: v.string(),
  systemPrompt: v.string(),
  maxOutputTokens: v.number(),
  exists: v.boolean(),
  offReason: v.union(
    v.literal("unconfigured"),
    v.literal("disabled"),
    v.literal("no_model"),
    v.literal("no_instruction"),
    v.null(),
  ),
};

const briefEntry = v.object({
  key: v.string(),
  label: v.string(),
  value: v.string(),
  source: v.union(
    v.literal("matchmaker"),
    v.literal("agent"),
    v.literal("agent_approved"),
  ),
  updatedAt: v.number(),
});

const briefShape = v.object({
  candidateName: v.string(),
  matchmakerName: v.string(),
  voice: v.string(),
  facts: v.array(briefEntry),
  notes: v.array(briefEntry),
  summary: v.optional(v.string()),
  messages: v.array(
    v.object({
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
    }),
  ),
});

export const draftContext = internalQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.union(
    v.object({
      brief: briefShape,
      settings: v.object(agentSettingsShape),
      briefedThrough: v.object({
        seq: v.number(),
        voiceUpdatedAt: v.number(),
        profileUpdatedAt: v.number(),
      }),
      threadId: v.union(v.string(), v.null()),
      voiceAt: v.number(),
      profileAt: v.number(),
      throughSeq: v.number(),
      count: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<DraftContext | null> => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation === null) return null;

    // Off is a supported state, not a failure: an unconfigured agent, a
    // switched-off one, or a deployment with no gateway all end here, and the
    // matchmaker simply writes their own messages.
    const settings = await activeAgent(ctx, "conversation");
    if (settings === null) return null;

    const candidate = await ctx.db.get("candidates", conversation.candidateId);
    const matchmaker = await ctx.db.get(
      "matchmakers",
      conversation.matchmakerId,
    );
    if (candidate === null || matchmaker === null) return null;
    // Nothing to draft for someone who cannot be written to.
    if (candidate.membership !== "joined") return null;

    const brief = await briefFor(
      ctx,
      conversation,
      candidate,
      matchmaker,
      liveWindow(),
    );

    return {
      brief,
      settings,
      briefedThrough: briefedThrough(conversation),
      threadId: conversation.agentThreadId ?? null,
      voiceAt: await voiceUpdatedAt(ctx, matchmaker._id),
      profileAt: profileHighWater(brief),
      throughSeq: conversation.lastSeq,
      count: replyCount(),
    };
  },
});
