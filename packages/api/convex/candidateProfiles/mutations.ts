/**
 * Writing a candidate's profile (prd/phase-2.md §3). Three doors into the same
 * room:
 *
 *   1. the matchmaker, through the public mutations below;
 *   2. an agent writing directly, through `applyAgentEntries`;
 *   3. an agent proposing, through the same internal mutation — which of the
 *      two it gets is decided by the field's policy, not by the caller.
 *
 * Every one of them goes through `writeEntry` in `profiles/helpers.ts`, so a
 * change to who may write what is a change to one function. A fourth door —
 * the candidate editing their own profile — would be a policy the registry
 * grows and a `writer` this file passes; nothing else here would move.
 */

import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "../_generated/server";
import { type AuditEventInput, recordAudit } from "../audit/helpers";
import type { FieldChange } from "../audit/rules";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import {
  approveEntry,
  type ProfileEntries,
  type ProfileWrite,
  type ProfileWriter,
  rejectEntry,
  withEntry,
  writeEntry,
} from "../profiles/helpers";
import {
  normaliseNoteBody,
  normaliseNoteKey,
  normaliseValue,
  noteBodyError,
  noteKeyError,
  valueError,
} from "../profiles/rules";
import { aiAgentId } from "../schema";
import { ensureCandidateProfile, noteCountError } from "./helpers";
import {
  type CandidateEntryKind,
  candidateAuditField,
  candidateField,
  candidateNotePolicy,
} from "./rules";

const entryKind = v.union(v.literal("facts"), v.literal("notes"));

/**
 * The key and normalised value to store, or a `ConvexError` saying why not.
 * The same code path for a matchmaker's form and an agent's output: an agent
 * that emits "Yes please!" for a yes/no field is refused exactly as a person
 * typing it would be.
 */
function validated(
  kind: CandidateEntryKind,
  rawKey: string,
  rawValue: string,
): { key: string; value: string } {
  if (kind === "notes") {
    const badKey = noteKeyError(rawKey);
    if (badKey) throw new ConvexError(badKey);
    const badBody = noteBodyError(rawValue);
    if (badBody) throw new ConvexError(badBody);
    return {
      key: normaliseNoteKey(rawKey),
      value: normaliseNoteBody(rawValue),
    };
  }
  const field = candidateField(rawKey.trim());
  if (field === null) throw new ConvexError("There's no such field.");
  const bad = valueError(field, rawValue);
  if (bad) throw new ConvexError(bad);
  return { key: field.key, value: normaliseValue(field, rawValue) };
}

/** A key on its own, for a removal — there is no value to check. */
function validatedKey(kind: CandidateEntryKind, rawKey: string): string {
  if (kind === "notes") {
    const bad = noteKeyError(rawKey);
    if (bad) throw new ConvexError(bad);
    return normaliseNoteKey(rawKey);
  }
  const field = candidateField(rawKey.trim());
  if (field === null) throw new ConvexError("There's no such field.");
  return field.key;
}

function policyFor(kind: CandidateEntryKind, key: string) {
  return kind === "notes"
    ? candidateNotePolicy(key)
    : (candidateField(key)?.policy ?? null);
}

/** The one-key patch for whichever map was touched. */
function patchFor(kind: CandidateEntryKind, entries: ProfileEntries) {
  return kind === "facts" ? { facts: entries } : { notes: entries };
}

async function requireProfile(
  ctx: MutationCtx,
  args: { matchmakerId: Id<"matchmakers">; candidateId: Id<"candidates"> },
): Promise<{
  user: Doc<"users">;
  candidate: Doc<"candidates">;
  profile: Doc<"candidateProfiles">;
}> {
  const { user, matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
  const candidate = await ctx.db.get("candidates", args.candidateId);
  assertSameTenant(candidate, matchmaker._id);
  const profile = await ensureCandidateProfile(ctx, candidate);
  return { user, candidate, profile };
}

/*
 * ─── The matchmaker's own edits ─────────────────────────────────────────────
 */

export const setEntry = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    kind: entryKind,
    key: v.string(),
    value: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, candidate, profile } = await requireProfile(ctx, args);
    const { key, value } = validated(args.kind, args.key, args.value);
    if (args.kind === "notes") {
      const full = noteCountError(profile.notes, key);
      if (full) throw new ConvexError(full);
    }
    const policy = policyFor(args.kind, key);
    if (policy === null) throw new ConvexError("There's no such field.");

    const now = Date.now();
    const { entry, outcome } = writeEntry({
      entry: profile[args.kind][key],
      policy,
      write: { action: "set", value },
      writer: { kind: "matchmaker", userId: user._id },
      now,
    });
    if (outcome.kind !== "written") return null;

    await ctx.db.patch("candidateProfiles", profile._id, {
      ...patchFor(args.kind, withEntry(profile[args.kind], key, entry)),
      updatedAt: now,
    });
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "profile.updated",
      entity: { table: "candidateProfiles", id: profile._id },
      changes: [
        {
          field: candidateAuditField(args.kind, key),
          before: outcome.before,
          after: outcome.after,
        },
      ],
    });
    return null;
  },
});

export const clearEntryValue = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    kind: entryKind,
    key: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, candidate, profile } = await requireProfile(ctx, args);
    const policy = policyFor(args.kind, args.key);
    if (policy === null) throw new ConvexError("There's no such field.");

    const now = Date.now();
    const { entry, outcome } = writeEntry({
      entry: profile[args.kind][args.key],
      policy,
      write: { action: "clear" },
      writer: { kind: "matchmaker", userId: user._id },
      now,
    });
    if (outcome.kind !== "written") return null;
    await ctx.db.patch("candidateProfiles", profile._id, {
      ...patchFor(args.kind, withEntry(profile[args.kind], args.key, entry)),
      updatedAt: now,
    });
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "profile.updated",
      entity: { table: "candidateProfiles", id: profile._id },
      changes: [
        {
          field: candidateAuditField(args.kind, args.key),
          before: outcome.before,
        },
      ],
    });
    return null;
  },
});

/**
 * Takes an agent's proposal, or drops it. Approving records the value moving,
 * not merely that a button was pressed — the History tab should read the same
 * whether a value was typed or agreed to.
 */
export const resolveSuggestion = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    kind: entryKind,
    key: v.string(),
    accept: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, candidate, profile } = await requireProfile(ctx, args);
    const now = Date.now();
    const actor = {
      type: "user",
      userId: user._id,
      role: "matchmaker",
    } as const;
    const field = candidateAuditField(args.kind, args.key);
    const current = profile[args.kind][args.key];

    if (args.accept) {
      const { entry, outcome } = approveEntry(current, {
        userId: user._id,
        now,
      });
      if (outcome.kind !== "written") return null;
      await ctx.db.patch("candidateProfiles", profile._id, {
        ...patchFor(args.kind, withEntry(profile[args.kind], args.key, entry)),
        updatedAt: now,
      });
      await recordAudit(ctx, {
        matchmakerId: candidate.matchmakerId,
        candidateId: candidate._id,
        actor,
        action: "profile.suggestion_accepted",
        entity: { table: "candidateProfiles", id: profile._id },
        changes: [{ field, before: outcome.before, after: outcome.after }],
      });
      return null;
    }

    const { entry, rejected, proposed } = rejectEntry(current);
    if (!rejected) return null;
    await ctx.db.patch("candidateProfiles", profile._id, {
      ...patchFor(args.kind, withEntry(profile[args.kind], args.key, entry)),
      updatedAt: now,
    });
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor,
      action: "profile.suggestion_rejected",
      entity: { table: "candidateProfiles", id: profile._id },
      // A removal that was turned down has no value to name; the field does.
      changes: [{ field, before: proposed }],
    });
    return null;
  },
});

/*
 * ─── The agent's write path ─────────────────────────────────────────────────
 *
 * Internal: reachable from the candidate-profile agent's action and from
 * nowhere a browser can go. The caller says what it noticed; it does **not**
 * say whether to write or to suggest — the field's policy decides, and an
 * agent that could choose would make the policy advisory.
 *
 * Nothing calls this yet. The agent that will is prd/phase-2.md §4.1B; this is
 * the door it comes through.
 */

const agentEntry = v.object({
  kind: entryKind,
  key: v.string(),
  // Absent means "set". "clear" removes the entry: an agent learns that
  // something has stopped being true as often as it learns what is, and an
  // empty `value` would not be a way of saying so.
  action: v.optional(v.union(v.literal("set"), v.literal("clear"))),
  value: v.optional(v.string()), // required when setting
  confidence: v.optional(v.number()), // 0..1, the agent's own
  sourceMessageId: v.optional(v.id("messages")),
  sourceQuote: v.optional(v.string()), // verbatim, so a matchmaker can check
});

const agentOutcome = v.union(
  v.literal("written"),
  v.literal("suggested"),
  v.literal("refused"),
  v.literal("unchanged"),
);

type AgentResult = {
  kind: CandidateEntryKind;
  key: string;
  outcome: "written" | "suggested" | "refused" | "unchanged";
  reason?: string;
};

export const applyAgentEntries = internalMutation({
  args: {
    candidateId: v.id("candidates"),
    agent: aiAgentId,
    model: v.string(),
    entries: v.array(agentEntry),
  },
  returns: v.array(
    v.object({
      kind: entryKind,
      key: v.string(),
      outcome: agentOutcome,
      reason: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args): Promise<AgentResult[]> => {
    const candidate = await ctx.db.get("candidates", args.candidateId);
    if (candidate === null) throw new ConvexError("Not found.");
    const profile = await ensureCandidateProfile(ctx, candidate);

    const now = Date.now();
    // A batch rather than a call per entry: two entries from the same message
    // must not race each other into the same document (prd §4.1B).
    let facts = profile.facts;
    let notes = profile.notes;
    const results: AgentResult[] = [];
    const written: FieldChange[] = [];
    const suggested: FieldChange[] = [];
    // A proposal that replaced an open one is its own event: `before` then
    // means the suggestion it superseded rather than the value on the record,
    // and one list holding both meanings would be unreadable.
    const resuggested: FieldChange[] = [];

    for (const raw of args.entries) {
      let key: string;
      let write: ProfileWrite;
      try {
        if (raw.action === "clear") {
          key = validatedKey(raw.kind, raw.key);
          write = { action: "clear" };
        } else {
          const checked = validated(raw.kind, raw.key, raw.value ?? "");
          key = checked.key;
          write = { action: "set", value: checked.value };
        }
      } catch (error) {
        // A model that emits a value the registry refuses is a bad generation,
        // not a bad request: the rest of the batch still applies.
        results.push({
          kind: raw.kind,
          key: raw.key,
          outcome: "refused",
          reason:
            error instanceof ConvexError
              ? String(error.data)
              : "Invalid value.",
        });
        continue;
      }

      const map = raw.kind === "facts" ? facts : notes;
      if (raw.kind === "notes" && write.action === "set") {
        const full = noteCountError(map, key);
        if (full) {
          results.push({
            kind: raw.kind,
            key,
            outcome: "refused",
            reason: full,
          });
          continue;
        }
      }
      const policy = policyFor(raw.kind, key);
      if (policy === null) {
        results.push({
          kind: raw.kind,
          key,
          outcome: "refused",
          reason: "There's no such field.",
        });
        continue;
      }

      const writer: ProfileWriter = {
        kind: "agent",
        agent: args.agent,
        model: args.model,
        confidence: raw.confidence,
        sourceMessageId: raw.sourceMessageId,
        sourceQuote: raw.sourceQuote,
      };
      const { entry, outcome } = writeEntry({
        entry: map[key],
        policy,
        write,
        writer,
        now,
      });
      const next = withEntry(map, key, entry);
      if (raw.kind === "facts") facts = next;
      else notes = next;

      const field = candidateAuditField(raw.kind, key);
      if (outcome.kind === "written") {
        written.push({ field, before: outcome.before, after: outcome.after });
      } else if (outcome.kind === "suggested") {
        (outcome.superseded ? resuggested : suggested).push({
          field,
          before: outcome.superseded
            ? outcome.supersededProposal
            : outcome.before,
          after: outcome.proposed,
        });
      }
      results.push({
        kind: raw.kind,
        key,
        outcome: outcome.kind,
        reason: outcome.kind === "refused" ? outcome.reason : undefined,
      });
    }

    if (
      written.length === 0 &&
      suggested.length === 0 &&
      resuggested.length === 0
    ) {
      return results;
    }

    await ctx.db.patch("candidateProfiles", profile._id, {
      facts,
      notes,
      updatedAt: now,
    });
    const base = {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor: { type: "agent", agent: args.agent, model: args.model },
      entity: { table: "candidateProfiles", id: profile._id },
    } satisfies Omit<AuditEventInput, "action">;
    if (written.length > 0) {
      await recordAudit(ctx, {
        ...base,
        action: "profile.updated",
        changes: written,
      });
    }
    if (suggested.length > 0) {
      await recordAudit(ctx, {
        ...base,
        action: "profile.suggested",
        changes: suggested,
      });
    }
    if (resuggested.length > 0) {
      await recordAudit(ctx, {
        ...base,
        action: "profile.suggested",
        changes: resuggested,
        reason:
          "Replaces an earlier suggestion, which is what `before` names here.",
      });
    }
    return results;
  },
});

/**
 * Remembers the thread the profile agent keeps for one conversation, and how
 * much of the record it has now been told about (prd/phase-2.md §4.1B).
 *
 * Written before the entries rather than after, so a thread the component has
 * already created is never orphaned by a failure further down: an unrecorded
 * thread would be re-created on the next run and the first one would sit in
 * the component's tables with nothing pointing at it — invisible to `ctx.db`,
 * and so invisible to an erasure.
 */
export const rememberProfileThread = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    threadId: v.string(),
    briefedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation === null) return null;
    // The switch may have gone off while the model was thinking, and turning
    // it off deletes the threads. Writing this back would point the record at
    // a thread that no longer exists.
    if (conversation.aiOff === true) return null;
    await ctx.db.patch("conversations", args.conversationId, {
      profileThreadId: args.threadId,
      profileBriefedAt: args.briefedAt,
    });
    return null;
  },
});
