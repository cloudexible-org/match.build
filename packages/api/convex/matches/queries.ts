/**
 * Reading the match board (prd/phase-3.md §2). Matchmaker-only: a candidate has
 * no route to any of this, and the introduction moment that would give them one
 * is still undesigned (§6).
 *
 * The cards come back as they were written — score, coverage and the signals
 * behind them — and the app composes the sentences from `matches/rules.ts`,
 * which it imports through `@repo/api`. One description of a signal, not a
 * second one shaped for a screen.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type QueryCtx, query } from "../_generated/server";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import {
  matchRejectedBy,
  matchResponse,
  matchSignal,
  matchStage,
} from "../schema";
import { MATCH_LIMITS, MATCH_STAGES, rejectedIsVisible } from "./rules";

/** One person on a card. The app falls back to the email, as the list does. */
const person = v.object({
  candidateId: v.id("candidates"),
  name: v.optional(v.string()),
  email: v.string(),
});

const card = v.object({
  matchId: v.id("matches"),
  a: person,
  b: person,
  origin: v.union(v.literal("algorithm"), v.literal("manual")),
  stage: matchStage,
  stageChangedAt: v.number(),
  score: v.optional(v.number()),
  coverage: v.optional(v.number()),
  signals: v.optional(v.array(matchSignal)),
  checkDealbreakers: v.optional(v.boolean()),
  algorithmVersion: v.optional(v.number()),
  lastScoredAt: v.optional(v.number()),
  candidateAResponse: v.optional(matchResponse),
  candidateBResponse: v.optional(matchResponse),
  rejectedBy: v.optional(matchRejectedBy),
  rejectionReason: v.optional(v.string()),
  outcome: v.optional(v.string()),
});

/**
 * Every card on this matchmaker's board, newest first within each stage — one
 * bounded read per column, so a Rejected lane a year deep can never crowd the
 * columns out of the query.
 *
 * Rejected cards age out of the *view* after a month (§2) rather than out of the
 * table: they are taste signal, and the one thing the platform should keep of a
 * match that didn't work is why.
 */
export const board = query({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.array(card),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const now = Date.now();
    const people = new Map<Id<"candidates">, Doc<"candidates"> | null>();

    const cards = [];
    for (const stage of MATCH_STAGES) {
      const rows = await ctx.db
        .query("matches")
        .withIndex("by_matchmakerId_and_stage", (q) =>
          q.eq("matchmakerId", matchmaker._id).eq("stage", stage),
        )
        .order("desc")
        .take(MATCH_LIMITS.cardsPerColumn);
      for (const match of rows) {
        if (
          stage === "rejected" &&
          !rejectedIsVisible(match.stageChangedAt, now)
        ) {
          continue;
        }
        const a = await personOn(ctx, people, match.candidateAId);
        const b = await personOn(ctx, people, match.candidateBId);
        // A card whose person has been erased or hard-lost is not a card. This
        // should not happen — nothing deletes a candidate — so it is skipped
        // rather than rendered half-empty.
        if (a === null || b === null) continue;
        cards.push({
          matchId: match._id,
          a,
          b,
          origin: match.origin,
          stage: match.stage,
          stageChangedAt: match.stageChangedAt,
          score: match.score,
          coverage: match.coverage,
          signals: match.signals,
          checkDealbreakers: match.checkDealbreakers,
          algorithmVersion: match.algorithmVersion,
          lastScoredAt: match.lastScoredAt,
          candidateAResponse: match.candidateAResponse,
          candidateBResponse: match.candidateBResponse,
          rejectedBy: match.rejectedBy,
          rejectionReason: match.rejectionReason,
          outcome: match.outcome,
        });
      }
    }
    return cards;
  },
});

/**
 * The matches one candidate is in, whichever side of the pair they are on
 * (prd/phase-3.md §2) — the candidate panel's first section.
 *
 * The same card the board draws, so a matchmaker reading a person's file sees
 * exactly what they would see on the board, plus the stage it is sitting at
 * — which the board says by *which column the card is in*, and a panel has no
 * columns to say it with.
 *
 * Two reads rather than one, because a pair is stored as `a` and `b` and this
 * person may be either. Bounded on each side: a carousel is not the place for
 * a hundred cards.
 */
export const forCandidate = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
  },
  returns: v.array(card),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    const now = Date.now();
    const people = new Map<Id<"candidates">, Doc<"candidates"> | null>();

    const rows = [
      ...(await ctx.db
        .query("matches")
        .withIndex("by_candidateAId", (q) =>
          q.eq("candidateAId", candidate._id),
        )
        .order("desc")
        .take(MATCH_LIMITS.cardsPerCandidate)),
      ...(await ctx.db
        .query("matches")
        .withIndex("by_candidateBId", (q) =>
          q.eq("candidateBId", candidate._id),
        )
        .order("desc")
        .take(MATCH_LIMITS.cardsPerCandidate)),
    ];

    const cards = [];
    for (const match of rows) {
      // Their own book only. The index is by candidate, and a candidate
      // belongs to one matchmaker — but a tenancy check that relies on that
      // is a tenancy check somebody can break by adding a second.
      if (match.matchmakerId !== matchmaker._id) continue;
      if (
        match.stage === "rejected" &&
        !rejectedIsVisible(match.stageChangedAt, now)
      ) {
        continue;
      }
      const a = await personOn(ctx, people, match.candidateAId);
      const b = await personOn(ctx, people, match.candidateBId);
      if (a === null || b === null) continue;
      cards.push({
        matchId: match._id,
        a,
        b,
        origin: match.origin,
        stage: match.stage,
        stageChangedAt: match.stageChangedAt,
        score: match.score,
        coverage: match.coverage,
        signals: match.signals,
        checkDealbreakers: match.checkDealbreakers,
        algorithmVersion: match.algorithmVersion,
        lastScoredAt: match.lastScoredAt,
        candidateAResponse: match.candidateAResponse,
        candidateBResponse: match.candidateBResponse,
        rejectedBy: match.rejectedBy,
        rejectionReason: match.rejectionReason,
        outcome: match.outcome,
      });
    }
    return cards;
  },
});

/**
 * Who a match can be made with by hand: joined, not archived, in this book.
 *
 * The same rule `matches.mutations.create` enforces — a picker that offers
 * somebody the mutation will refuse is a picker that lies.
 */
export const matchable = query({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.array(person),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const rows = [];
    for (const status of ["active", "paused"] as const) {
      const candidates = await ctx.db
        .query("candidates")
        .withIndex("by_matchmakerId_and_status", (q) =>
          q.eq("matchmakerId", matchmaker._id).eq("status", status),
        )
        .take(MATCH_LIMITS.book);
      for (const candidate of candidates) {
        if (candidate.membership !== "joined") continue;
        rows.push(await describe(ctx, candidate));
      }
    }
    rows.sort((left, right) =>
      (left.name ?? left.email).localeCompare(right.name ?? right.email),
    );
    return rows;
  },
});

async function personOn(
  ctx: QueryCtx,
  cache: Map<Id<"candidates">, Doc<"candidates"> | null>,
  candidateId: Id<"candidates">,
): Promise<{
  candidateId: Id<"candidates">;
  name?: string;
  email: string;
} | null> {
  // A board of twenty cards is a board of far fewer people: reading each of
  // them once is the difference between forty reads and twelve.
  if (!cache.has(candidateId)) {
    cache.set(candidateId, await ctx.db.get("candidates", candidateId));
  }
  const candidate = cache.get(candidateId) ?? null;
  return candidate === null ? null : await describe(ctx, candidate);
}

/** Their name as the matchmaker labelled them, else the account's, else nothing. */
async function describe(
  ctx: QueryCtx,
  candidate: Doc<"candidates">,
): Promise<{ candidateId: Id<"candidates">; name?: string; email: string }> {
  let name = candidate.name;
  if (name === undefined && candidate.userId !== undefined) {
    name = (await ctx.db.get("users", candidate.userId))?.name;
  }
  return { candidateId: candidate._id, name, email: candidate.email };
}
