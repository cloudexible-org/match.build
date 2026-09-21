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
import { type AuditActor, recordAudit } from "../audit/helpers";
import type { FieldChange } from "../audit/rules";
import { candidateProfileFor } from "../candidateProfiles/helpers";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { matchClosedBy, matchOutcome, matchStage } from "../schema";
import {
  factsOf,
  insertMatch,
  matchForPair,
  orderedIds,
  recordMatchAudit,
  runMatchPass,
} from "./helpers";
import {
  closingNeedsWho,
  closingNoteError,
  evaluatePair,
  MATCH_LIMITS,
  type ProfileFacts,
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
 *  - closing is reached through `close`, which takes what happened;
 *  - moving a card *out* of closed clears what closing recorded, because a
 *    match back on the board is not one that ended, and a stale "she said no"
 *    under a live card is worse than none.
 *
 * Moving a card is also looking at it, so an unseen one stops being new.
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
      seenAt: match.seenAt ?? now,
      updatedAt: now,
    };
    if (match.stage === "closed") {
      patch.closedAs = undefined;
      patch.closedBy = undefined;
      patch.closingNote = undefined;
      changes.push({ field: "closedAs", before: match.closedAs });
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
 * Ends a match, and takes it off the board (prd/phase-3.md §2).
 *
 * One mutation for both ways a match can end, because they are the same event:
 * somebody saying this is over and saying what happened. A rejection is not a
 * stage a card rests in and a wedding is not a column — both are a closing
 * record on a card that has left.
 *
 * What it takes:
 *
 *  - **the outcome**, one of two, so a book can be counted: "three together
 *    this year" is a sentence a matchmaker should be able to read off it;
 *  - **who ended it**, where it didn't work. *Whose* no it was is the taste
 *    signal the board exists to collect, and a match that ended with the two
 *    of them together was not ended by anybody;
 *  - **a note**, required for a no and optional for a yes (`closingNoteError`);
 *  - **`archiveBoth`**, offered only when they're together: two people who
 *    found each other are not in the book to be matched any more. It stays the
 *    matchmaker's call — a couple can also break up — so it is a thing they
 *    tick rather than a thing that happens to them.
 */
export const close = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    matchId: v.id("matches"),
    outcome: matchOutcome,
    closedBy: v.optional(matchClosedBy),
    note: v.string(),
    archiveBoth: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, match } = await ownMatch(
      ctx,
      args.matchmakerId,
      args.matchId,
    );
    if (match.stage === "closed") throw new ConvexError("It's already closed.");

    const closedBy = closingNeedsWho(args.outcome) ? args.closedBy : undefined;
    if (closingNeedsWho(args.outcome)) {
      if (closedBy === undefined) throw new ConvexError("Say who ended it.");
      if (closedBy === "system") {
        // The nightly run's own word for taking a suggestion back. A person
        // ending a match is one of the three who could have.
        throw new ConvexError("Say who ended it.");
      }
    }
    const bad = closingNoteError(args.outcome, args.note);
    if (bad) throw new ConvexError(bad);

    const now = Date.now();
    const note = args.note.trim();
    const actor = actorFor(user._id);
    await ctx.db.patch("matches", match._id, {
      stage: "closed",
      stageChangedAt: now,
      closedAs: args.outcome,
      closedBy,
      closingNote: note === "" ? undefined : note,
      seenAt: match.seenAt ?? now,
      updatedAt: now,
    });
    await auditAfter(ctx, match._id, {
      action: "match.closed",
      actor,
      changes: [
        { field: "stage", before: match.stage, after: "closed" },
        { field: "closedAs", after: args.outcome },
        ...(closedBy === undefined
          ? []
          : [{ field: "closedBy", after: closedBy }]),
      ],
      reason: note === "" ? undefined : note,
    });

    if (args.archiveBoth === true && args.outcome === "together") {
      for (const candidateId of [match.candidateAId, match.candidateBId]) {
        await archive(ctx, candidateId, actor, match._id);
      }
    }
    return null;
  },
});

/**
 * Marks a card as seen, which is the whole of what the Reviewing column used to
 * say — without a card having to be dragged through a column to say it.
 *
 * Driven by a button on the card and never by reading one: unseen cards sort
 * first, so marking on read would reorder a card out from under the cursor of
 * the person reading it. Moving or closing a card still counts, because both
 * of those are decisions rather than a glance.
 *
 * Idempotent, and deliberately one-way: a way to mark a card unread again would
 * be a second kind of bookkeeping about cards rather than about people.
 */
export const markSeen = mutation({
  args: { matchmakerId: v.id("matchmakers"), matchId: v.id("matches") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { match } = await ownMatch(ctx, args.matchmakerId, args.matchId);
    if (match.seenAt !== undefined) return null;
    // Not audited: that somebody glanced at a card is not a change to the
    // record of two people, and a trail full of glances buries the events that
    // are.
    await ctx.db.patch("matches", match._id, { seenAt: Date.now() });
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

/**
 * Takes a candidate out of the book's matching pool by archiving them, the way
 * a matchmaker would from their own list — the same status, the same audit
 * action, so there is one meaning of "archived" and not two. Already-archived
 * and no-longer-joined records are left alone.
 */
async function archive(
  ctx: MutationCtx,
  candidateId: Id<"candidates">,
  actor: AuditActor,
  matchId: Id<"matches">,
): Promise<void> {
  const candidate = await ctx.db.get("candidates", candidateId);
  if (candidate === null || candidate.status === "archived") return;
  await ctx.db.patch("candidates", candidate._id, { status: "archived" });
  await recordAudit(ctx, {
    matchmakerId: candidate.matchmakerId,
    candidateId: candidate._id,
    actor,
    action: "candidate.status_changed",
    entity: { table: "candidates", id: candidate._id },
    changes: [{ field: "status", before: candidate.status, after: "archived" }],
    relatedEntityId: matchId,
    reason: "They found somebody.",
  });
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
