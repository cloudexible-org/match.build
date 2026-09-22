/**
 * Writing a matchmaker's own profile (prd/phase-2.md §4.1C): their voice, and
 * the three practice fields. The same three doors as a candidate's profile,
 * and the same engine behind them: the matchmaker writes it, an agent
 * proposes, and the policy in `rules.ts` decides which.
 *
 * Their voice is `suggest`, so an agent never changes it under them. It may
 * distil a draft from what they have sent; they decide it sounds like them.
 *
 * The practice fields are `matchmaker`, which is stricter still: `writeEntry`
 * refuses an agent write outright rather than turning it into a proposal, so
 * there is no door here an agent can reach at all.
 */

import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import { requireMatchmaker } from "../matchmakers/helpers";
import { approveEntry, rejectEntry, writeEntry } from "../profiles/helpers";
import { normaliseValue, valueError } from "../profiles/rules";
import { aiAgentId } from "../schema";
import { ensureMatchmakerProfile, matchmakerProfileFor } from "./helpers";
import {
  type PracticeFieldKey,
  practiceField,
  VOICE_AUDIT_FIELD,
  VOICE_FIELD,
} from "./rules";

/**
 * One of the three practice fields (`rules.ts`): who they work with, how they
 * work, what they don't do.
 *
 * One mutation over three, because they differ only in which column they land
 * in — three near-identical handlers would be three places for the audit call
 * to be forgotten.
 *
 * No agent path. These are `matchmaker` policy, so `writeEntry` would refuse
 * an agent writer, and nothing internal calls this anyway: it takes a signed-in
 * matchmaker or it does nothing.
 */
export const setPracticeField = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    field: v.union(
      v.literal("whoYouWorkWith"),
      v.literal("howYouWork"),
      v.literal("whatYouDont"),
    ),
    value: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const field = practiceField(args.field);
    // Unreachable through the validator above; the alternative is a non-null
    // assertion on a registry lookup, which is the thing that stops being true.
    if (field === null) throw new ConvexError("Unknown field.");

    const invalid = valueError(field, args.value);
    if (invalid) throw new ConvexError(invalid);

    const profile = await ensureMatchmakerProfile(ctx, matchmaker._id);
    const key: PracticeFieldKey = args.field;
    const now = Date.now();
    const { entry, outcome } = writeEntry({
      entry: profile[key],
      policy: field.policy,
      write: { action: "set", value: normaliseValue(field, args.value) },
      writer: { kind: "matchmaker", userId: user._id },
      now,
    });
    if (outcome.kind !== "written") return null;

    await ctx.db.patch("matchmakerProfiles", profile._id, {
      [key]: entry,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "matchmaker_profile.updated",
      entity: { table: "matchmakerProfiles", id: profile._id },
      // Before and after both, as the voice write does: the trail is where a
      // field's history lives, and a matchmaker who pastes over their own
      // notes should be able to get the old ones back.
      changes: [{ field: key, before: outcome.before, after: outcome.after }],
    });
    return null;
  },
});

export const setVoice = mutation({
  args: { matchmakerId: v.id("matchmakers"), value: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const invalid = valueError(VOICE_FIELD, args.value);
    if (invalid) throw new ConvexError(invalid);

    const profile = await ensureMatchmakerProfile(ctx, matchmaker._id);
    const now = Date.now();
    const { entry, outcome } = writeEntry({
      entry: profile.voice,
      policy: VOICE_FIELD.policy,
      write: { action: "set", value: normaliseValue(VOICE_FIELD, args.value) },
      writer: { kind: "matchmaker", userId: user._id },
      now,
    });
    if (outcome.kind !== "written") return null;

    await ctx.db.patch("matchmakerProfiles", profile._id, {
      voice: entry,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "matchmaker_profile.updated",
      entity: { table: "matchmakerProfiles", id: profile._id },
      changes: [
        {
          field: VOICE_AUDIT_FIELD,
          before: outcome.before,
          after: outcome.after,
        },
      ],
    });
    return null;
  },
});

export const clearVoice = mutation({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const profile = await matchmakerProfileFor(ctx, matchmaker._id);
    if (profile === null) return null;

    const now = Date.now();
    const { entry, outcome } = writeEntry({
      entry: profile.voice,
      policy: VOICE_FIELD.policy,
      write: { action: "clear" },
      writer: { kind: "matchmaker", userId: user._id },
      now,
    });
    if (outcome.kind !== "written") return null;
    await ctx.db.patch("matchmakerProfiles", profile._id, {
      voice: entry,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "matchmaker_profile.updated",
      entity: { table: "matchmakerProfiles", id: profile._id },
      changes: [{ field: VOICE_AUDIT_FIELD, before: outcome.before }],
    });
    return null;
  },
});

/** Takes the agent's draft, or drops it. */
export const resolveVoiceSuggestion = mutation({
  args: { matchmakerId: v.id("matchmakers"), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const profile = await matchmakerProfileFor(ctx, matchmaker._id);
    if (profile === null) return null;

    const now = Date.now();
    const actor = {
      type: "user",
      userId: user._id,
      role: "matchmaker",
    } as const;
    const entity = {
      table: "matchmakerProfiles",
      id: profile._id,
    } as const;

    if (args.accept) {
      const { entry, outcome } = approveEntry(profile.voice, {
        userId: user._id,
        now,
      });
      if (outcome.kind !== "written") return null;
      await ctx.db.patch("matchmakerProfiles", profile._id, {
        voice: entry,
        updatedAt: now,
      });
      await recordAudit(ctx, {
        matchmakerId: matchmaker._id,
        actor,
        action: "matchmaker_profile.suggestion_accepted",
        entity,
        changes: [
          {
            field: VOICE_AUDIT_FIELD,
            before: outcome.before,
            after: outcome.after,
          },
        ],
      });
      return null;
    }

    const { entry, rejected, proposed } = rejectEntry(profile.voice);
    if (!rejected) return null;
    await ctx.db.patch("matchmakerProfiles", profile._id, {
      voice: entry,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      actor,
      action: "matchmaker_profile.suggestion_rejected",
      entity,
      changes: [{ field: VOICE_AUDIT_FIELD, before: proposed }],
    });
    return null;
  },
});

/*
 * ─── The agent's write path ─────────────────────────────────────────────────
 *
 * Internal, and nothing calls it yet: the agent that will is prd/phase-2.md
 * §4.1C. It offers a draft; the policy turns that into a proposal, because a
 * matchmaker's voice is `suggest`. The caller does not get to choose.
 */
export const applyAgentVoice = internalMutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    agent: aiAgentId,
    model: v.string(),
    value: v.string(),
    confidence: v.optional(v.number()),
  },
  returns: v.union(
    v.literal("written"),
    v.literal("suggested"),
    v.literal("refused"),
    v.literal("unchanged"),
  ),
  handler: async (ctx, args) => {
    const matchmaker = await ctx.db.get("matchmakers", args.matchmakerId);
    if (matchmaker === null) throw new ConvexError("Not found.");
    // A model that writes 6,000 characters of voice is a bad generation, not a
    // bad request: it is dropped rather than throwing into the agent's action.
    if (valueError(VOICE_FIELD, args.value) !== null) return "refused";

    const profile = await ensureMatchmakerProfile(ctx, matchmaker._id);
    const now = Date.now();
    const { entry, outcome } = writeEntry({
      entry: profile.voice,
      policy: VOICE_FIELD.policy,
      write: { action: "set", value: normaliseValue(VOICE_FIELD, args.value) },
      writer: {
        kind: "agent",
        agent: args.agent,
        model: args.model,
        confidence: args.confidence,
      },
      now,
    });
    if (outcome.kind === "refused" || outcome.kind === "unchanged") {
      return outcome.kind;
    }

    await ctx.db.patch("matchmakerProfiles", profile._id, {
      voice: entry,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      actor: { type: "agent", agent: args.agent, model: args.model },
      action:
        outcome.kind === "written"
          ? "matchmaker_profile.updated"
          : "matchmaker_profile.suggested",
      entity: { table: "matchmakerProfiles", id: profile._id },
      changes: [
        {
          field: VOICE_AUDIT_FIELD,
          before: outcome.before,
          after: outcome.kind === "written" ? outcome.after : outcome.proposed,
        },
      ],
    });
    return outcome.kind;
  },
});
