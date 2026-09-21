/**
 * The write engine both profile domains share (prd/phase-2.md §3).
 *
 * Every write — a matchmaker's own edit and an agent's — goes through
 * `applyWrite`, so the rule about who may change what is enforced in exactly
 * one place and means the same thing for a candidate's profile and a
 * matchmaker's.
 *
 * Pure functions over entry maps: they return the new value rather than
 * patching, so a caller changing several fields at once produces one patch and
 * one audit event. Nothing here is registered as a Convex function.
 */

import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { AiAgentId } from "../ai/rules";
import type { profileEntry } from "../schema";
import {
  agentWriteMode,
  PROFILE_LIMITS,
  type ProfileValueSource,
  type ProfileWritePolicy,
} from "./rules";

export type ProfileEntry = Infer<typeof profileEntry>;
export type ProfileEntries = Record<string, ProfileEntry>;

/**
 * Who is making a change, and what to record about it.
 *
 * A third kind — the candidate editing their own profile — is a policy the
 * registry would have to grow before it is a writer this union would have to,
 * so it is deliberately absent rather than stubbed (prd/phase-2.md §9.3).
 */
export type ProfileWriter =
  | { kind: "matchmaker"; userId: Id<"users"> }
  | {
      kind: "agent";
      agent: AiAgentId;
      model: string;
      confidence?: number;
      sourceMessageId?: Id<"messages">;
      sourceQuote?: string;
    };

/**
 * What is being asked for. A removal is its own action rather than an empty
 * value, because an entry whose value is `""` is one nothing has been recorded
 * for — the two would be indistinguishable, and an agent learns that something
 * has stopped being true as often as it learns what is.
 */
export type ProfileWrite =
  | { action: "set"; value: string }
  | { action: "clear" };

/** What a write did, so the caller knows what to audit and what to say. */
export type WriteOutcome =
  /** The record moved. `after` is absent when the entry was removed. */
  | { kind: "written"; before?: string; after?: string }
  /**
   * The agent may not write here, so it left a proposal instead. `proposed` is
   * absent when it is proposing a removal. `superseded` says it replaced an
   * open proposal on the same field, and `supersededProposal` is the value
   * that proposal held — absent when the one it replaced was itself a removal.
   */
  | {
      kind: "suggested";
      before?: string;
      proposed?: string;
      superseded: boolean;
      supersededProposal?: string;
    }
  /** The agent may not touch this field at all. */
  | { kind: "refused"; reason: string }
  /** Already exactly this, or already proposed, or nothing to remove. */
  | { kind: "unchanged" };

/**
 * Applies `write` to `entry`, or leaves it as a proposal, or refuses —
 * whichever the field's policy and what is already there allow
 * (`agentWriteMode`).
 *
 * A `set`'s value must already be normalised (`normaliseValue`); this does not
 * validate, because a person's form and an agent's output need the same error
 * messages and those live in `rules.ts`.
 *
 * ─── A proposal and a change at the same time ───────────────────────────────
 *
 * There is at most one open proposal per field, and the newest wins: a second
 * run that has learnt something better about the same field **replaces** the
 * first proposal rather than queuing behind it, and the outcome says so, so
 * the one it replaced reaches the audit trail rather than vanishing.
 *
 * A proposal survives a direct write, because writing a value is not the same
 * as answering the question the agent asked and whoever wrote it may never
 * have seen it. The exceptions are the two writes that *do* answer it: writing
 * exactly what it proposed, and removing an entry it proposed removing.
 */
export function writeEntry(args: {
  entry: ProfileEntry | undefined;
  policy: ProfileWritePolicy;
  write: ProfileWrite;
  writer: ProfileWriter;
  now: number;
}): { entry: ProfileEntry | undefined; outcome: WriteOutcome } {
  const { entry, policy, write, writer, now } = args;
  const before = entry?.value === "" ? undefined : entry?.value;
  const open = entry?.pending;

  if (writer.kind === "agent") {
    const mode = agentWriteMode(policy, sourceOf(entry));
    if (mode === "refuse") {
      return {
        entry,
        outcome: {
          kind: "refused",
          reason: "Only the matchmaker writes this field.",
        },
      };
    }
    if (mode === "suggest") {
      if (nothingToDo(write, before, open)) {
        return { entry, outcome: { kind: "unchanged" } };
      }
      const base: ProfileEntry = entry ?? {
        value: "",
        source: "agent",
        updatedAt: now,
      };
      return {
        entry: {
          ...base,
          pending: {
            action: write.action,
            value: write.action === "set" ? write.value : "",
            suggestedAt: now,
            model: writer.model,
            confidence: writer.confidence,
            sourceQuote: clipQuote(writer.sourceQuote),
            sourceMessageId: writer.sourceMessageId,
          },
        },
        outcome: {
          kind: "suggested",
          before,
          proposed: write.action === "set" ? write.value : undefined,
          superseded: open !== undefined,
          supersededProposal: open?.action === "set" ? open.value : undefined,
        },
      };
    }
  }

  if (write.action === "clear") {
    if (before === undefined) return { entry, outcome: { kind: "unchanged" } };
    // Removing an entry answers a proposal to remove it, and says nothing
    // about a proposal to change it.
    const keep = open?.action === "set" ? open : undefined;
    return {
      entry:
        keep === undefined
          ? undefined
          : { ...(entry as ProfileEntry), value: "", pending: keep },
      outcome: { kind: "written", before, after: undefined },
    };
  }

  if (before === write.value) return { entry, outcome: { kind: "unchanged" } };

  const written = entryFor(write.value, writer, now);
  // Writing exactly what it proposed answers it; leaving the proposal up would
  // then be nagging about a change already made.
  const answered =
    open === undefined || (open.action === "set" && open.value === write.value);
  return {
    entry: answered ? written : { ...written, pending: open },
    outcome: { kind: "written", before, after: write.value },
  };
}

/** Whether a proposal would tell the matchmaker anything they don't have. */
function nothingToDo(
  write: ProfileWrite,
  before: string | undefined,
  open: ProfileEntry["pending"],
): boolean {
  if (write.action === "clear") {
    // Nothing to remove, or the same removal is already on the table.
    return before === undefined || open?.action === "clear";
  }
  // Already says it, or the same value is already on the table.
  return (
    before === write.value ||
    (open?.action === "set" && open.value === write.value)
  );
}

/**
 * Takes an agent's proposal, as the matchmaker approving it — a new value, or
 * the removal it asked for.
 *
 * An approved value is `agent_approved` rather than `matchmaker`: they agreed
 * with it, they did not write it, and a later agent run is allowed to revise
 * its own work but never theirs (`agentWriteMode`).
 */
export function approveEntry(
  entry: ProfileEntry | undefined,
  args: { userId: Id<"users">; now: number },
): { entry: ProfileEntry | undefined; outcome: WriteOutcome } {
  const pending = entry?.pending;
  if (entry === undefined || pending === undefined) {
    return { entry, outcome: { kind: "unchanged" } };
  }
  const before = entry.value === "" ? undefined : entry.value;

  if (pending.action === "clear") {
    return {
      entry: undefined,
      outcome: { kind: "written", before, after: undefined },
    };
  }

  const { pending: _dropped, ...rest } = entry;
  return {
    entry: {
      ...rest,
      value: pending.value,
      source: "agent_approved",
      updatedAt: args.now,
      updatedByUserId: args.userId,
      model: pending.model,
      confidence: pending.confidence,
      sourceMessageId: pending.sourceMessageId,
      sourceQuote: pending.sourceQuote,
    },
    outcome: { kind: "written", before, after: pending.value },
  };
}

/**
 * Drops a proposal without taking it. The entry goes with it when there was no
 * value underneath — a rejected suggestion on a field nobody had filled in
 * leaves nothing behind.
 *
 * `proposed` is what was on the table, so the trail records what was turned
 * down; it is absent when the proposal was a removal.
 */
export function rejectEntry(entry: ProfileEntry | undefined): {
  entry: ProfileEntry | undefined;
  rejected: boolean;
  proposed?: string;
} {
  const pending = entry?.pending;
  if (entry === undefined || pending === undefined) {
    return { entry, rejected: false };
  }
  const proposed = pending.action === "set" ? pending.value : undefined;
  if (entry.value === "") return { entry: undefined, rejected: true, proposed };
  const { pending: _dropped, ...rest } = entry;
  return { entry: rest, rejected: true, proposed };
}

/** An entry whose value is empty says nothing about who wrote it. */
function sourceOf(entry: ProfileEntry | undefined): ProfileValueSource | null {
  return entry?.value ? entry.source : null;
}

function entryFor(
  value: string,
  writer: ProfileWriter,
  now: number,
): ProfileEntry {
  if (writer.kind === "matchmaker") {
    return {
      value,
      source: "matchmaker",
      updatedAt: now,
      updatedByUserId: writer.userId,
    };
  }
  return {
    value,
    source: "agent",
    updatedAt: now,
    model: writer.model,
    confidence: writer.confidence,
    sourceMessageId: writer.sourceMessageId,
    sourceQuote: clipQuote(writer.sourceQuote),
  };
}

function clipQuote(quote: string | undefined): string | undefined {
  if (quote === undefined) return undefined;
  const trimmed = quote.trim();
  if (!trimmed) return undefined;
  return trimmed.length > PROFILE_LIMITS.sourceQuote
    ? `${trimmed.slice(0, PROFILE_LIMITS.sourceQuote - 1)}…`
    : trimmed;
}

/*
 * ─── Maps of entries ────────────────────────────────────────────────────────
 *
 * A candidate's profile holds two maps; a matchmaker's holds one entry. These
 * lift the single-entry functions above over a map.
 */

/** Sets, or removes when `entry` is undefined. */
export function withEntry(
  entries: ProfileEntries,
  key: string,
  entry: ProfileEntry | undefined,
): ProfileEntries {
  if (entry === undefined) {
    const next = { ...entries };
    delete next[key];
    return next;
  }
  return { ...entries, [key]: entry };
}
