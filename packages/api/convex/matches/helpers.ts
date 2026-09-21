/**
 * The match board's engine: reading a book, scoring every pair in it, and
 * keeping the board in step with the profiles underneath (prd/phase-3.md §5).
 *
 * Plain functions taking a `ctx`; nothing here is registered as a function. The
 * arithmetic itself is in `./rules.ts`, which has no Convex imports and is
 * where the algorithm can be read and tested without a database.
 *
 * One pass over one book is one transaction. The cron fans out — a job per
 * matchmaker — so a slow book never delays another tenant's, and a book that
 * fails doesn't take the rest of the platform's night with it.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { type AuditActor, recordAudit } from "../audit/helpers";
import type { AuditAction, FieldChange } from "../audit/rules";
import {
  evaluatePair,
  isSuggestable,
  MATCH_ALGORITHM_VERSION,
  MATCH_LIMITS,
  type MatchBlocker,
  type MatchSignal,
  type PairVerdict,
  type ProfileFacts,
  pairKey,
} from "./rules";

/*
 * ─── Reading a book ─────────────────────────────────────────────────────────
 */

/**
 * The values in a profile, without the metadata around them. An entry held
 * open by a pending proposal has an empty `value` and is not a fact yet: the
 * algorithm reads what has been recorded, never what has been suggested.
 */
export function factsOf(profile: Doc<"candidateProfiles">): ProfileFacts {
  const facts: ProfileFacts = {};
  for (const [key, entry] of Object.entries(profile.facts)) {
    if (entry.value !== "") facts[key] = entry.value;
  }
  return facts;
}

export type BookMember = {
  candidate: Doc<"candidates">;
  facts: ProfileFacts;
};

/**
 * Who in this book may be matched: joined, active, and with a profile that has
 * something in it.
 *
 * Paused and archived are the matchmaker's own way of saying "not now", and an
 * invitation nobody has accepted is not a person in the book yet. Somebody with
 * no facts at all is left out rather than scored against everyone at zero
 * coverage.
 */
export async function eligibleBook(
  ctx: QueryCtx,
  matchmakerId: Id<"matchmakers">,
): Promise<BookMember[]> {
  const candidates = await ctx.db
    .query("candidates")
    .withIndex("by_matchmakerId_and_status", (q) =>
      q.eq("matchmakerId", matchmakerId).eq("status", "active"),
    )
    .take(MATCH_LIMITS.book);
  const profiles = await ctx.db
    .query("candidateProfiles")
    .withIndex("by_matchmakerId", (q) => q.eq("matchmakerId", matchmakerId))
    .take(MATCH_LIMITS.book);

  const factsByCandidate = new Map<Id<"candidates">, ProfileFacts>();
  for (const profile of profiles) {
    const facts = factsOf(profile);
    if (Object.keys(facts).length > 0) {
      factsByCandidate.set(profile.candidateId, facts);
    }
  }

  const book: BookMember[] = [];
  for (const candidate of candidates) {
    if (candidate.membership !== "joined") continue;
    const facts = factsByCandidate.get(candidate._id);
    if (facts === undefined) continue;
    book.push({ candidate, facts });
  }
  return book;
}

/*
 * ─── Auditing a card ────────────────────────────────────────────────────────
 */

/**
 * Records one thing that happened to a match on **both** candidates' trails
 * (prd/phase-3.md §2).
 *
 * Two events, not one: a trail is read one person at a time, and an event
 * filed under only one of them would leave the other's history quietly missing
 * the introduction they were half of. `relatedEntityId` on each event is the
 * *other* candidate, so a reader can follow the card back.
 */
export async function recordMatchAudit(
  ctx: MutationCtx,
  args: {
    match: Doc<"matches">;
    action: AuditAction;
    actor: AuditActor;
    changes?: FieldChange[];
    reason?: string;
  },
): Promise<void> {
  const { match } = args;
  for (const [self, other] of [
    [match.candidateAId, match.candidateBId],
    [match.candidateBId, match.candidateAId],
  ]) {
    await recordAudit(ctx, {
      matchmakerId: match.matchmakerId,
      candidateId: self,
      actor: args.actor,
      action: args.action,
      entity: { table: "matches", id: match._id },
      changes: args.changes,
      relatedEntityId: other,
      reason: args.reason,
    });
  }
}

/** The card for a pair, or `null`. One indexed read, because `pairKey` is it. */
export async function matchForPair(
  ctx: QueryCtx,
  a: Id<"candidates">,
  b: Id<"candidates">,
): Promise<Doc<"matches"> | null> {
  return await ctx.db
    .query("matches")
    .withIndex("by_pairKey", (q) => q.eq("pairKey", pairKey(a, b)))
    .unique();
}

/*
 * ─── One pass over one book ─────────────────────────────────────────────────
 */

export type MatchRunReport = {
  /** People who could be matched at all. */
  considered: number;
  /** Pairs the algorithm looked at. */
  pairs: number;
  /** New cards written. Capped by `MATCH_LIMITS.newPerRun`. */
  created: number;
  /** Untouched suggestions whose score moved with the profiles under them. */
  rescored: number;
  /** Untouched suggestions the run took back off the board. */
  withdrawn: number;
  /** Suggestable pairs it had no room for tonight. */
  heldBack: number;
};

/**
 * Scores every pair in one book and brings the board up to date.
 *
 * Three things can happen to a pair:
 *
 *  - **Nothing.** A pair that already has a card the matchmaker has touched —
 *    anything past `suggested`, anything rejected, anything made by hand — is
 *    left exactly alone. The run never reopens a decision a person made, which
 *    is what makes it safe to run every night.
 *  - **A card.** A pair with no card, that passes the hard filters and clears
 *    both thresholds, becomes a `suggested` card. Highest score first, up to
 *    the nightly cap.
 *  - **A correction.** An untouched `suggested` card is rescored against the
 *    profiles as they are now: the score moves, or — if the pair has since
 *    become impossible, or fallen below the bar — the card is withdrawn into
 *    the Rejected lane, marked as the run's own doing rather than anyone's
 *    judgement.
 *
 * Idempotent: running it twice in a row changes nothing the second time.
 */
export async function runMatchPass(
  ctx: MutationCtx,
  matchmakerId: Id<"matchmakers">,
  actor: AuditActor,
  now: number = Date.now(),
): Promise<MatchRunReport> {
  const book = await eligibleBook(ctx, matchmakerId);
  const existing = await ctx.db
    .query("matches")
    .withIndex("by_matchmakerId", (q) => q.eq("matchmakerId", matchmakerId))
    .take(MATCH_LIMITS.boardCards);
  const byPair = new Map(existing.map((match) => [match.pairKey, match]));

  const report: MatchRunReport = {
    considered: book.length,
    pairs: 0,
    created: 0,
    rescored: 0,
    withdrawn: 0,
    heldBack: 0,
  };

  type Candidate = { a: BookMember; b: BookMember; verdict: PairVerdict };
  const newcomers: Candidate[] = [];

  for (let i = 0; i < book.length; i += 1) {
    for (let j = i + 1; j < book.length; j += 1) {
      const a = book[i];
      const b = book[j];
      report.pairs += 1;
      const verdict = evaluatePair(a.facts, b.facts, now);
      const key = pairKey(a.candidate._id, b.candidate._id);
      const current = byPair.get(key);
      if (current === undefined) {
        if (isSuggestable(verdict)) newcomers.push({ a, b, verdict });
        continue;
      }
      // Only the run's own untouched suggestions are its to revise.
      if (current.stage !== "suggested" || current.origin !== "algorithm") {
        continue;
      }
      const revised = await reviseSuggestion(ctx, current, verdict, actor, now);
      if (revised === "withdrawn") report.withdrawn += 1;
      if (revised === "rescored") report.rescored += 1;
    }
  }

  // Best first, and — for two pairs on the same score — by the pair itself, so
  // a re-run picks the same twenty rather than a coin toss.
  newcomers.sort((left, right) => {
    const delta = scoreOf(right.verdict) - scoreOf(left.verdict);
    if (delta !== 0) return delta;
    return pairKey(left.a.candidate._id, left.b.candidate._id) <
      pairKey(right.a.candidate._id, right.b.candidate._id)
      ? -1
      : 1;
  });
  report.heldBack = Math.max(0, newcomers.length - MATCH_LIMITS.newPerRun);

  for (const { a, b, verdict } of newcomers.slice(0, MATCH_LIMITS.newPerRun)) {
    if (!verdict.ok) continue; // unreachable: `isSuggestable` implies `ok`
    await insertMatch(ctx, {
      matchmakerId,
      candidateAId: a.candidate._id,
      candidateBId: b.candidate._id,
      origin: "algorithm",
      verdict,
      actor,
      action: "match.suggested",
      now,
    });
    report.created += 1;
  }

  return report;
}

function scoreOf(verdict: PairVerdict): number {
  return verdict.ok ? verdict.score : -1;
}

/** The scored half of a card, from a verdict. */
function scoring(verdict: PairVerdict, now: number) {
  return {
    score: verdict.ok ? verdict.score : undefined,
    coverage: verdict.ok ? verdict.coverage : undefined,
    signals: verdict.ok ? verdict.signals : undefined,
    checkDealbreakers: verdict.ok ? verdict.checkDealbreakers : undefined,
    algorithmVersion: MATCH_ALGORITHM_VERSION,
    lastScoredAt: now,
  };
}

/**
 * Writes a card and audits it on both trails. Shared by the nightly run and by
 * a matchmaker pairing two people themselves, so a manual card carries the same
 * arithmetic as a found one — including one that the filters say shouldn't
 * work, which is a thing worth being told rather than prevented.
 */
export async function insertMatch(
  ctx: MutationCtx,
  args: {
    matchmakerId: Id<"matchmakers">;
    candidateAId: Id<"candidates">;
    candidateBId: Id<"candidates">;
    origin: "algorithm" | "manual";
    verdict: PairVerdict;
    actor: AuditActor;
    action: AuditAction;
    now: number;
  },
): Promise<Id<"matches">> {
  const [candidateAId, candidateBId] = orderedIds(
    args.candidateAId,
    args.candidateBId,
  );
  const id = await ctx.db.insert("matches", {
    matchmakerId: args.matchmakerId,
    candidateAId,
    candidateBId,
    pairKey: pairKey(candidateAId, candidateBId),
    origin: args.origin,
    stage: "suggested",
    stageChangedAt: args.now,
    ...scoring(args.verdict, args.now),
    updatedAt: args.now,
  });
  const match = await ctx.db.get("matches", id);
  if (match === null) throw new Error("The match vanished as it was made.");
  await recordMatchAudit(ctx, {
    match,
    action: args.action,
    actor: args.actor,
    changes: [{ field: "stage", after: "suggested" }],
    reason: args.verdict.ok
      ? undefined
      : `Paired by hand against the filters: ${blockerSentence(args.verdict.blockers)}`,
  });
  return id;
}

/** The two ids in the order the table stores them. */
export function orderedIds(
  a: Id<"candidates">,
  b: Id<"candidates">,
): [Id<"candidates">, Id<"candidates">] {
  return a < b ? [a, b] : [b, a];
}

export function blockerSentence(blockers: readonly MatchBlocker[]): string {
  return blockers.map((blocker) => blocker.detail).join(" ");
}

/**
 * Brings one untouched suggestion up to date with the profiles under it.
 *
 * A score that moves is patched in place and not audited: an arithmetic result
 * recomputed from data whose own changes are already in the trail is not a new
 * fact about anybody, and a nightly entry per card per book would bury the
 * events that are. Withdrawing a card *is* audited — the board visibly changes,
 * and a matchmaker is owed the reason.
 */
async function reviseSuggestion(
  ctx: MutationCtx,
  match: Doc<"matches">,
  verdict: PairVerdict,
  actor: AuditActor,
  now: number,
): Promise<"withdrawn" | "rescored" | "unchanged"> {
  if (!verdict.ok) {
    await withdraw(
      ctx,
      match,
      verdict,
      blockerSentence(verdict.blockers),
      actor,
      now,
    );
    return "withdrawn";
  }
  if (!isSuggestable(verdict)) {
    const why = `The score fell to ${verdict.score} on what's recorded now.`;
    await withdraw(ctx, match, verdict, why, actor, now);
    return "withdrawn";
  }

  const unchanged =
    match.score === verdict.score &&
    match.coverage === verdict.coverage &&
    match.algorithmVersion === MATCH_ALGORITHM_VERSION &&
    sameSignals(match.signals, verdict.signals);
  if (unchanged) return "unchanged";

  await ctx.db.patch("matches", match._id, {
    ...scoring(verdict, now),
    updatedAt: now,
  });
  return "rescored";
}

/**
 * Takes a suggestion back off the board, into the Rejected lane, marked as the
 * run's own doing. Audited, unlike a rescoring: the board visibly changes, and a
 * matchmaker who saw a card yesterday is owed the reason it has gone.
 */
async function withdraw(
  ctx: MutationCtx,
  match: Doc<"matches">,
  verdict: PairVerdict,
  why: string,
  actor: AuditActor,
  now: number,
): Promise<void> {
  await ctx.db.patch("matches", match._id, {
    stage: "rejected",
    stageChangedAt: now,
    rejectedBy: "system",
    rejectionReason: why,
    ...scoring(verdict, now),
    updatedAt: now,
  });
  const withdrawn = await ctx.db.get("matches", match._id);
  if (withdrawn === null) return;
  await recordMatchAudit(ctx, {
    match: withdrawn,
    action: "match.rejected",
    actor,
    changes: [
      { field: "stage", before: "suggested", after: "rejected" },
      { field: "rejectedBy", after: "system" },
    ],
    reason: why,
  });
}

/**
 * Field by field, deliberately: a stored document's fields come back in the
 * database's own order rather than the order they were written in, so comparing
 * two of these as JSON says "different" every time — and the run would patch
 * every card in every book every night, reporting each one as a change.
 */
function sameSignals(
  before: readonly MatchSignal[] | undefined,
  after: readonly MatchSignal[],
): boolean {
  if ((before?.length ?? 0) !== after.length) return false;
  return after.every((signal, index) => {
    const was = before?.[index];
    return (
      was !== undefined &&
      was.key === signal.key &&
      was.weight === signal.weight &&
      was.earned === signal.earned &&
      was.detail === signal.detail
    );
  });
}
