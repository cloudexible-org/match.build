import {
  coverageLabel,
  type Id,
  MATCH_REJECTED_BY_LABELS,
  MATCH_RESPONSE_LABELS,
  type MatchRejectedBy,
  type MatchResponse,
  type MatchStage,
  matchSignalLabel,
  topSignals,
} from "@repo/api";
import { candidateDisplayName } from "../workspace/candidate-labels";

/**
 * What the match board shows and how it reads (prd/phase-3.md §2).
 *
 * Plain functions, no React, so the sentences on a card can be tested without
 * rendering one. Everything that decides *meaning* — what a signal is called,
 * which reasons a card leads with, what a score's coverage is worth — comes
 * from `matches/rules.ts` through `@repo/api`, the same code the nightly run
 * used. This file only arranges it.
 */

export type BoardPerson = {
  candidateId: Id<"candidates">;
  name?: string;
  email: string;
};

export type BoardSignal = {
  key: string;
  weight: number;
  earned: number;
  detail: string;
};

export type BoardCard = {
  matchId: Id<"matches">;
  a: BoardPerson;
  b: BoardPerson;
  origin: "algorithm" | "manual";
  stage: MatchStage;
  stageChangedAt: number;
  score?: number;
  coverage?: number;
  signals?: BoardSignal[];
  checkDealbreakers?: boolean;
  algorithmVersion?: number;
  lastScoredAt?: number;
  candidateAResponse?: MatchResponse;
  candidateBResponse?: MatchResponse;
  rejectedBy?: MatchRejectedBy;
  rejectionReason?: string;
  outcome?: string;
};

export function personName(person: BoardPerson): string {
  return candidateDisplayName(person);
}

/** "Sam and Jordan" — a card is about both of them, in the stored order. */
export function cardTitle(card: BoardCard): string {
  return `${personName(card.a)} and ${personName(card.b)}`;
}

/**
 * The cards in one column, in the order that column wants them.
 *
 * `Suggested` is a shortlist, so the best pair is at the top. Every other
 * column is a queue of things the matchmaker has moved, so the most recently
 * moved is at the top — including the Rejected lane, where the newest
 * rejection is the one still worth reading.
 */
export function cardsInStage(
  cards: readonly BoardCard[],
  stage: MatchStage,
): BoardCard[] {
  const mine = cards.filter((card) => card.stage === stage);
  if (stage === "suggested") {
    return mine.sort(
      (left, right) =>
        (right.score ?? -1) - (left.score ?? -1) ||
        right.stageChangedAt - left.stageChangedAt,
    );
  }
  return mine.sort((left, right) => right.stageChangedAt - left.stageChangedAt);
}

/**
 * How a score is drawn. Three bands rather than a gradient: a number a
 * matchmaker is deciding with should read as strong, fair or thin at a glance,
 * and 61 is not meaningfully better than 58.
 */
export type ScoreTone = "strong" | "fair" | "thin";

export function scoreTone(score: number | undefined): ScoreTone {
  if (score === undefined) return "thin";
  if (score >= 80) return "strong";
  if (score >= 65) return "fair";
  return "thin";
}

/** "72 — on most of a profile", or nothing for a card nobody scored. */
export function scoreLine(card: BoardCard): string | null {
  if (card.score === undefined) return null;
  const coverage =
    card.coverage === undefined ? null : coverageLabel(card.coverage);
  return coverage === null ? `${card.score}` : `${card.score} — ${coverage}`;
}

export type CardReason = {
  key: string;
  label: string;
  detail: string;
  /** Whether this is a reason for rather than against. */
  agrees: boolean;
};

/**
 * The few reasons a card leads with, worked out by the same function the run
 * would use. A reason that earned a quarter of its weight or less is shown as
 * one against: the point of the card is what a matchmaker should check, not a
 * list of things that agree.
 */
export function cardReasons(card: BoardCard, limit = 3): CardReason[] {
  if (card.signals === undefined) return [];
  return topSignals(card.signals, limit).map((signal) => ({
    key: signal.key,
    label: matchSignalLabel(signal.key),
    detail: signal.detail,
    agrees: signal.earned > 0.25,
  }));
}

/** Every reason, strongest first — what the card shows when it's opened. */
export function allReasons(card: BoardCard): CardReason[] {
  return cardReasons(card, card.signals?.length ?? 0);
}

/**
 * Where the two yeses stand, for an introduced card. Named people rather than
 * "A" and "B": the sub-state is only useful if you can see whose answer is
 * missing.
 */
export function responseLine(card: BoardCard): string | null {
  const a = card.candidateAResponse;
  const b = card.candidateBResponse;
  if (a === undefined && b === undefined) return null;
  return `${personName(card.a)}: ${MATCH_RESPONSE_LABELS[a ?? "pending"]} · ${personName(card.b)}: ${MATCH_RESPONSE_LABELS[b ?? "pending"]}`;
}

/**
 * "Jordan: she's moving to Berlin."
 *
 * Named, where the rejection was one of theirs. `MATCH_REJECTED_BY_LABELS` has
 * to say "First candidate", because the audit trail renders those sentences
 * with no card in front of it — but a card has both people on it, and "second
 * candidate" in front of two names is a small puzzle nobody should have to
 * solve.
 */
export function rejectionLine(card: BoardCard): string | null {
  if (card.stage !== "rejected") return null;
  const who =
    card.rejectedBy === undefined
      ? null
      : card.rejectedBy === "candidateA"
        ? personName(card.a)
        : card.rejectedBy === "candidateB"
          ? personName(card.b)
          : MATCH_REJECTED_BY_LABELS[card.rejectedBy];
  const reason = card.rejectionReason;
  if (who === null) return reason ?? null;
  return reason === undefined ? `Turned down by ${who}` : `${who}: ${reason}`;
}

/** Which person a response belongs to, for the buttons on an introduced card. */
export const RESPONSE_SIDES = ["a", "b"] as const;
export type ResponseSide = (typeof RESPONSE_SIDES)[number];

export function sideOf(card: BoardCard, side: ResponseSide): BoardPerson {
  return side === "a" ? card.a : card.b;
}

export function responseOf(card: BoardCard, side: ResponseSide): MatchResponse {
  return (
    (side === "a" ? card.candidateAResponse : card.candidateBResponse) ??
    "pending"
  );
}

export type RunReport = {
  considered: number;
  pairs: number;
  created: number;
  rescored: number;
  withdrawn: number;
  heldBack: number;
};

/**
 * What a run just did, in one line.
 *
 * It says what it looked at as well as what it found, because "no new
 * suggestions" means something completely different over sixty pairs than over
 * one — and a matchmaker whose book has one filled-in profile should be told
 * that rather than left thinking the algorithm has an opinion.
 */
export function runSummary(report: RunReport): string {
  const people = `${report.considered} ${plural(report.considered, "profile")}`;
  if (report.considered < 2) {
    return `Only ${people} to work with — matching needs at least two.`;
  }
  const parts = [
    `Looked at ${people}, ${report.pairs} ${plural(report.pairs, "pair")}`,
  ];
  parts.push(
    report.created === 0
      ? "nothing new to suggest"
      : `${report.created} new ${plural(report.created, "suggestion")}`,
  );
  if (report.heldBack > 0)
    parts.push(`${report.heldBack} held back for tonight`);
  if (report.rescored > 0) parts.push(`${report.rescored} rescored`);
  if (report.withdrawn > 0) parts.push(`${report.withdrawn} withdrawn`);
  return `${parts.join(" · ")}.`;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
