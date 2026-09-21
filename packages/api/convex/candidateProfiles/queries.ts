/**
 * Reading a candidate's profile (prd/phase-2.md §3). Matchmaker-only: a
 * candidate has no route to their own profile, which is a product decision and
 * not a legal one (§7, §9.3).
 *
 * The stored entries come back as they are and the app composes them with the
 * registry it already imports through `@repo/api`, so there is one description
 * of a field and not a second one shaped for a screen.
 */

import { type Infer, v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { candidateDisplayName } from "../candidates/helpers";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { profileEntry } from "../schema";
import { candidateProfileFor } from "./helpers";
import {
  candidateField,
  candidateNoteLabel,
  type ProfileStateEntry as ReconcileStateEntry,
} from "./rules";

const profileShape = v.object({
  facts: v.record(v.string(), profileEntry),
  notes: v.record(v.string(), profileEntry),
  updatedAt: v.number(),
});

/** An unwritten profile is empty, not absent: the form is the same either way. */
const EMPTY: Infer<typeof profileShape> = {
  facts: {},
  notes: {},
  updatedAt: 0,
};

export const get = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
  },
  returns: profileShape,
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    const profile = await candidateProfileFor(ctx, candidate._id);
    if (profile === null) return EMPTY;
    return {
      facts: profile.facts,
      notes: profile.notes,
      updatedAt: profile.updatedAt,
    };
  },
});

/*
 * ─── The profile agent's context (prd/phase-2.md §4.1B) ─────────────────────
 */

/**
 * Everything the reconciling run needs, in one read: who this is, the thread
 * it keeps, and the record as it stands.
 *
 * Internal, and called from an action — so it is the one read in this domain
 * that answers to no matchmaker. It is reached only from `actions.ts`, which
 * is reached only from the drafting run, which is reached only from a message
 * in a conversation that a tenant check already passed.
 */
export const reconcileContext = internalQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.union(
    v.null(),
    v.object({
      matchmakerId: v.id("matchmakers"),
      candidateId: v.id("candidates"),
      candidateName: v.string(),
      threadId: v.union(v.string(), v.null()),
      /** The whole record on a first run; what has changed on a later one. */
      state: v.array(
        v.object({
          kind: v.union(v.literal("facts"), v.literal("notes")),
          key: v.string(),
          label: v.string(),
          value: v.string(),
          byHand: v.boolean(),
          pending: v.boolean(),
        }),
      ),
      /** The high-water mark this run would be briefing through. */
      profileAt: v.number(),
    }),
  ),
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null) return null;
    // The matchmaker's switch for this conversation covers both agents: it
    // says "no AI on this one", not "no drafts on this one".
    if (conversation.aiOff === true) return null;
    const candidate = await ctx.db.get("candidates", conversation.candidateId);
    if (candidate === null) return null;

    const profile = await candidateProfileFor(ctx, candidate._id);
    const since =
      conversation.profileThreadId === undefined
        ? 0
        : (conversation.profileBriefedAt ?? 0);

    const state: ReconcileStateEntry[] = [];
    let profileAt = since;
    for (const kind of ["facts", "notes"] as const) {
      for (const [key, entry] of Object.entries(profile?.[kind] ?? {})) {
        profileAt = Math.max(profileAt, entry.updatedAt);
        if (entry.updatedAt <= since) continue;
        if (entry.value === "" && entry.pending === undefined) continue;
        state.push({
          kind,
          key,
          label:
            kind === "facts"
              ? (candidateField(key)?.label ?? key)
              : candidateNoteLabel(key),
          value: entry.value,
          byHand: entry.source === "matchmaker",
          pending: entry.pending !== undefined,
        });
      }
    }

    return {
      matchmakerId: conversation.matchmakerId,
      candidateId: candidate._id,
      candidateName: await candidateDisplayName(ctx, candidate),
      threadId: conversation.profileThreadId ?? null,
      state,
      profileAt,
    };
  },
});
