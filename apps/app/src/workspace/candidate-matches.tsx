import {
  api,
  type Id,
  MATCH_STAGE_LABELS,
  type MatchRejectedBy,
  type MatchResponse,
  type MatchStage,
} from "@repo/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { CarouselArrow, CarouselCounter } from "../components/carousel";
import { currentIndex, stepId } from "../lib/carousel";
import { serverErrorMessage } from "../lib/server-error";
import type { BoardCard, ResponseSide } from "../matches/cards";
import { type CardActions, MatchCard } from "../matches/match-card";
import { useWorkspace } from "./workspace-layout";

/**
 * The matches this candidate is in — the first section of the candidate panel
 * (prd/phase-3.md §2).
 *
 * **The same card the board draws**, so a matchmaker reading a person's file
 * sees exactly what they would see on the board, and everything they can do
 * there they can do here: move it on, record a response, reject it with a
 * reason, write the outcome. A second, smaller rendering of a match would be a
 * second thing to keep true.
 *
 * One card at a time with arrows through the rest, because a person can be in
 * several and the panel is one column wide. The one thing this adds is the
 * **stage**: the board says which stage a card is in by which column it sits
 * in, and a panel has no columns to say it with.
 */
export function CandidateMatches({
  candidateId,
}: {
  candidateId: Id<"candidates">;
}) {
  const workspace = useWorkspace();
  const cards = useQuery(api.matches.queries.forCandidate, {
    matchmakerId: workspace.matchmakerId,
    candidateId,
  });
  const moveStage = useMutation(api.matches.mutations.moveStage);
  const reject = useMutation(api.matches.mutations.reject);
  const recordResponse = useMutation(api.matches.mutations.recordResponse);
  const recordOutcome = useMutation(api.matches.mutations.recordOutcome);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (cards === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="no-matches">
        No matches yet. The nightly run looks for them, and you can make one by
        hand on the board.
      </p>
    );
  }

  const items = cards.map((card) => ({ ...card, id: card.matchId }));
  const index = currentIndex(items, selectedId);
  const card = items[index];
  if (card === undefined) return null;
  const many = items.length > 1;
  const previousId = stepId(items, index, -1);
  const nextId = stepId(items, index, 1);

  async function attempt(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
    } catch (thrown) {
      setError(serverErrorMessage(thrown, "That didn't work. Try again."));
    }
  }

  const actions = (which: BoardCard): CardActions => ({
    onMove: (stage: MatchStage) =>
      void attempt(() =>
        moveStage({
          matchmakerId: workspace.matchmakerId,
          matchId: which.matchId,
          stage,
        }),
      ),
    onReject: (rejectedBy: MatchRejectedBy, reason: string) =>
      void attempt(() =>
        reject({
          matchmakerId: workspace.matchmakerId,
          matchId: which.matchId,
          rejectedBy,
          reason,
        }),
      ),
    onRespond: (side: ResponseSide, response: MatchResponse) =>
      void attempt(() =>
        recordResponse({
          matchmakerId: workspace.matchmakerId,
          matchId: which.matchId,
          side,
          response,
        }),
      ),
    onOutcome: (outcome: string) =>
      void attempt(() =>
        recordOutcome({
          matchmakerId: workspace.matchmakerId,
          matchId: which.matchId,
          outcome,
        }),
      ),
    conversationPath: (one, side) =>
      `/mm/${workspace.username}/c/${side === "a" ? one.a.candidateId : one.b.candidateId}`,
  });

  return (
    <div className="flex flex-col gap-2" data-testid="candidate-matches">
      <div className="flex items-center gap-2">
        {/* What the board says by which column the card is in. */}
        <span
          className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
          data-testid="candidate-match-stage"
          data-stage={card.stage}
        >
          {MATCH_STAGE_LABELS[card.stage]}
        </span>
        <span className="flex-1" />
        {many && <CarouselCounter index={index} count={items.length} />}
      </div>

      <div className="flex items-center gap-1">
        {many && (
          <CarouselArrow
            direction="previous"
            label="Previous match"
            disabled={previousId === null}
            onClick={() => setSelectedId(previousId)}
          />
        )}
        <div className="min-w-0 flex-1">
          <MatchCard card={card} actions={actions(card)} />
        </div>
        {many && (
          <CarouselArrow
            direction="next"
            label="Next match"
            disabled={nextId === null}
            onClick={() => setSelectedId(nextId)}
          />
        )}
      </div>

      {error !== null && (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-testid="candidate-matches-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
