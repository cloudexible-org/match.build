/**
 * Writing the match board (prd/phase-3.md §2).
 *
 * Two kinds of door:
 *
 *  - **the nightly run**, through `runNightly` → `runForMatchmaker`, whose
 *    actor is the system and which only ever touches its own untouched
 *    suggestions;
 *  - **the matchmaker**, through everything else: pairing two people by hand,
 *    moving a card, turning one down, recording what each side said.
 *
 * Every one of them reaches `matches/helpers.ts` for the writing and the audit,
 * so "both candidates' trails get the event" is one function and not seven.
 * Nothing in this file calls a model: the board is deterministic, and
 * `matches/rules.ts` is the whole of the reasoning behind it.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "../_generated/server";
import type { AuditActor } from "../audit/helpers";
import type { FieldChange } from "../audit/rules";
import { candidateProfileFor } from "../candidateProfiles/helpers";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { matchRejectedBy, matchResponse, matchStage } from "../schema";
import {
  factsOf,
  insertMatch,
  matchForPair,
  orderedIds,
  recordMatchAudit,
  runMatchPass,
} from "./helpers";
import {
  bothSaidYes,
  evaluatePair,
  MATCH_LIMITS,
  outcomeError,
  type ProfileFacts,
  rejectionReasonError,
  stageChangeError,
} from "./rules";

/*
 * ─── The nightly run ────────────────────────────────────────────────────────
 */

const runReport = v.object({
  considered: v.number(),
  pairs: v.number(),
  created: v.number(),
  rescored: v.number(),
  withdrawn: v.number(),
  heldBack: v.number(),
});

/**
 * Every night, one job per book (prd/phase-3.md §5; scheduled in
 * `convex/crons.ts`).
 *
 * This mutation reads the list of matchmakers and schedules the work; it does
 * none of it. A single transaction covering every tenant's book would be one
 * read limit away from a night where nobody gets any matches, and one slow book
 * away from delaying the rest.
 */
export const runNightly = internalMutation({
  args: {},
  returns: v.object({ books: v.number() }),
  handler: async (ctx) => {
    const matchmakers = await ctx.db
      .query("matchmakers")
      .take(MATCH_LIMITS.booksPerRun);
    for (const matchmaker of matchmakers) {
      await ctx.scheduler.runAfter(
        0,
        internal.matches.mutations.runForMatchmaker,
        { matchmakerId: matchmaker._id },
      );
    }
    return { books: matchmakers.length };
  },
});

/** One book's pass, as the system. */
export const runForMatchmaker = internalMutation({
  args: { matchmakerId: v.id("matchmakers") },
  returns: runReport,
  handler: async (ctx, args) => {
    return await runMatchPass(ctx, args.matchmakerId, {
      type: "system",
      job: "nightly_match",
    });
  },
});

/**
 * The same pass, now, because the matchmaker asked for it.
 *
 * Not a convenience over waiting for tonight: a matchmaker who has just filled
 * in four profiles wants to know what that changed, and an algorithm that only
 * speaks at 3am can't be learnt from. It runs as them, so the cards it makes
 * are recorded as theirs to have asked for.
 */
export const refresh = mutation({
  args: { matchmakerId: v.id("matchmakers") },
  returns: runReport,
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    return await runMatchPass(ctx, matchmaker._id, actorFor(user._id));
  },
});

/*
 * ─── The matchmaker's own hands ─────────────────────────────────────────────
 */

/**
 * Pairs two people by hand (prd/phase-3.md §2): an identical card, with
 * `origin: "manual"`.
 *
 * It is still scored, and a pair the filters say is impossible is still made.
 * A matchmaker who knows something the profiles don't is the reason this exists
 * — but the card says what the algorithm thought, and the audit event says the
 * pair was made against it.
 */
export const create = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateAId: v.id("candidates"),
    candidateBId: v.id("candidates"),
  },
  returns: v.id("matches"),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    if (args.candidateAId === args.candidateBId) {
      throw new ConvexError("A match needs two different people.");
    }
    const [first, second] = orderedIds(args.candidateAId, args.candidateBId);
    const a = await matchableCandidate(ctx, first, matchmaker._id);
    const b = await matchableCandidate(ctx, second, matchmaker._id);

    const already = await matchForPair(ctx, a._id, b._id);
    if (already !== null) {
      throw new ConvexError("Those two are already on the board.");
    }

    const now = Date.now();
    return await insertMatch(ctx, {
      matchmakerId: matchmaker._id,
      candidateAId: a._id,
      candidateBId: b._id,
      origin: "manual",
      verdict: evaluatePair(
        await factsFor(ctx, a._id),
        await factsFor(ctx, b._id),
        now,
      ),
      actor: actorFor(user._id),
      action: "match.created",
      now,
    });
  },
});

/**
 * Moves a card between columns.
 *
 * Any column to any other: a matchmaker knows what happened between two people
 * better than a state machine does (`stageChangeError`). Two exceptions, both
 * about not losing something:
 *
 *  - the Rejected lane is reached through `reject`, which takes who and why;
 *  - moving a card *out* of it clears that, because a card back on the board
 *    is no longer a rejection, and a stale reason is worse than none.
 *
 * Arriving at `introduced` starts both sides as `pending`, which is what makes
 * the two-yeses sub-state visible on the card.
 */
export const moveStage = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    matchId: v.id("matches"),
    stage: matchStage,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, match } = await ownMatch(
      ctx,
      args.matchmakerId,
      args.matchId,
    );
    const bad = stageChangeError(match.stage, args.stage);
    if (bad) throw new ConvexError(bad);

    const now = Date.now();
    const changes: FieldChange[] = [
      { field: "stage", before: match.stage, after: args.stage },
    ];
    const patch: MatchPatch = {
      stage: args.stage,
      stageChangedAt: now,
      updatedAt: now,
    };
    if (match.stage === "rejected") {
      patch.rejectedBy = undefined;
      patch.rejectionReason = undefined;
      changes.push({ field: "rejectedBy", before: match.rejectedBy });
    }
    if (args.stage === "introduced") {
      patch.candidateAResponse = match.candidateAResponse ?? "pending";
      patch.candidateBResponse = match.candidateBResponse ?? "pending";
    }
    await ctx.db.patch("matches", match._id, patch);
    await auditAfter(ctx, match._id, {
      action: "match.stage_changed",
      actor: actorFor(user._id),
      changes,
    });
    return null;
  },
});

/**
 * Turns a match down, from any stage (prd/phase-3.md §2).
 *
 * Who and why are both required, and the reason is free text on purpose: it is
 * the taste signal the board exists to collect, and a dropdown of five reasons
 * would collect five reasons.
 */
export const reject = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    matchId: v.id("matches"),
    rejectedBy: matchRejectedBy,
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, match } = await ownMatch(
      ctx,
      args.matchmakerId,
      args.matchId,
    );
    if (args.rejectedBy === "system") {
      // The nightly run's own word for withdrawing a suggestion. A person
      // turning a match down is one of the three who could have.
      throw new ConvexError("Say who turned it down.");
    }
    const bad = rejectionReasonError(args.reason);
    if (bad) throw new ConvexError(bad);
    if (match.stage === "rejected") {
      throw new ConvexError("It's already been turned down.");
    }

    const now = Date.now();
    const reason = args.reason.trim();
    await ctx.db.patch("matches", match._id, {
      stage: "rejected",
      stageChangedAt: now,
      rejectedBy: args.rejectedBy,
      rejectionReason: reason,
      updatedAt: now,
    });
    await auditAfter(ctx, match._id, {
      action: "match.rejected",
      actor: actorFor(user._id),
      changes: [
        { field: "stage", before: match.stage, after: "rejected" },
        { field: "rejectedBy", after: args.rejectedBy },
      ],
      reason,
    });
    return null;
  },
});

/**
 * Records what one side said to an introduction, as the matchmaker heard it.
 *
 * Nothing here asks the candidate anything: the introduction moment is still
 * undesigned (prd/phase-3.md §6), and until it is, the two yeses are something
 * a matchmaker writes down rather than something the product collects.
 *
 * Two yeses on an introduced card advance it to `mutual_interest` in the same
 * mutation — that transition *is* the two yeses (§2), so having to also drag
 * the card would be a second way of saying the same thing, and a way of being
 * wrong about it.
 */
export const recordResponse = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    matchId: v.id("matches"),
    side: v.union(v.literal("a"), v.literal("b")),
    response: matchResponse,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, match } = await ownMatch(
      ctx,
      args.matchmakerId,
      args.matchId,
    );
    const field =
      args.side === "a" ? "candidateAResponse" : "candidateBResponse";
    const before = match[field];
    if (before === args.response) return null;

    const now = Date.now();
    const patch: MatchPatch =
      args.side === "a"
        ? { candidateAResponse: args.response, updatedAt: now }
        : { candidateBResponse: args.response, updatedAt: now };
    const changes: FieldChange[] = [{ field, before, after: args.response }];
    const advances =
      match.stage === "introduced" &&
      bothSaidYes(
        args.side === "a" ? args.response : match.candidateAResponse,
        args.side === "b" ? args.response : match.candidateBResponse,
      );
    if (advances) {
      patch.stage = "mutual_interest";
      patch.stageChangedAt = now;
      changes.push({
        field: "stage",
        before: match.stage,
        after: "mutual_interest",
      });
    }
    await ctx.db.patch("matches", match._id, patch);
    await auditAfter(ctx, match._id, {
      action: advances ? "match.stage_changed" : "match.response_recorded",
      actor: actorFor(user._id),
      changes,
    });
    return null;
  },
});

/**
 * What came of a match. Free text, and only on a card that got somewhere:
 * "what outcomes do we record" is an open question (prd/phase-3.md §6), and
 * a list of options invented before it is answered would be the answer.
 */
export const recordOutcome = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    matchId: v.id("matches"),
    outcome: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, match } = await ownMatch(
      ctx,
      args.matchmakerId,
      args.matchId,
    );
    const bad = outcomeError(args.outcome);
    if (bad) throw new ConvexError(bad);
    const outcome = args.outcome.trim();
    if (outcome === match.outcome) return null;
    await ctx.db.patch("matches", match._id, {
      outcome,
      updatedAt: Date.now(),
    });
    await auditAfter(ctx, match._id, {
      action: "match.outcome_recorded",
      actor: actorFor(user._id),
      changes: [{ field: "outcome", before: match.outcome, after: outcome }],
    });
    return null;
  },
});

/*
 * ─── Shared ─────────────────────────────────────────────────────────────────
 */

/** What `ctx.db.patch` takes: the document's own fields, any subset of them. */
type MatchPatch = Partial<Omit<Doc<"matches">, "_id" | "_creationTime">>;

function actorFor(userId: Id<"users">): AuditActor {
  return { type: "user", userId, role: "matchmaker" };
}

/** The caller's own match, or the same "Not found." either way. */
async function ownMatch(
  ctx: MutationCtx,
  matchmakerId: Id<"matchmakers">,
  matchId: Id<"matches">,
): Promise<{ user: Doc<"users">; match: Doc<"matches"> }> {
  const { user, matchmaker } = await requireMatchmaker(ctx, matchmakerId);
  const match = await ctx.db.get("matches", matchId);
  assertSameTenant(match, matchmaker._id);
  return { user, match };
}

/**
 * Someone a match can be made with: in this book, joined, and not archived.
 *
 * Membership is the hard part — you cannot introduce someone who has not
 * accepted an invitation, or who has left. `archived` is the matchmaker's own
 * way of saying they are done with this person for now; `paused` is not, so it
 * is allowed.
 */
async function matchableCandidate(
  ctx: MutationCtx,
  candidateId: Id<"candidates">,
  matchmakerId: Id<"matchmakers">,
): Promise<Doc<"candidates">> {
  const candidate = await ctx.db.get("candidates", candidateId);
  assertSameTenant(candidate, matchmakerId);
  if (candidate.membership !== "joined") {
    throw new ConvexError("They haven't joined your book yet.");
  }
  if (candidate.status === "archived") {
    throw new ConvexError("They're archived. Reactivate them first.");
  }
  return candidate;
}

async function factsFor(
  ctx: MutationCtx,
  candidateId: Id<"candidates">,
): Promise<ProfileFacts> {
  const profile = await candidateProfileFor(ctx, candidateId);
  return profile === null ? {} : factsOf(profile);
}

/**
 * Audits a change against the card as it now is, so the event points at the
 * same document the patch just wrote rather than a copy from before it.
 */
async function auditAfter(
  ctx: MutationCtx,
  matchId: Id<"matches">,
  event: {
    action: Parameters<typeof recordMatchAudit>[1]["action"];
    actor: AuditActor;
    changes: FieldChange[];
    reason?: string;
  },
): Promise<void> {
  const match = await ctx.db.get("matches", matchId);
  if (match === null) throw new Error("The match vanished as it moved.");
  await recordMatchAudit(ctx, { match, ...event });
}
