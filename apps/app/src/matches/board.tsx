import {
  api,
  MATCH_BOARD_STAGES,
  MATCH_STAGE_DESCRIPTIONS,
  MATCH_STAGE_LABELS,
  type MatchStage,
} from "@repo/api";
import { Button, cn } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type DragEvent, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import { useWorkspace } from "../workspace/workspace-layout";
import {
  type BoardCard,
  cardsInStage,
  closedSummary,
  type RunReport,
  runSummary,
} from "./cards";
import { type CardActions, MatchCard } from "./match-card";
import { NewMatch } from "./new-match";

/**
 * The match board (prd/phase-3.md §2): five columns, a Rejected lane under
 * them, and every card produced by the deterministic algorithm in
 * `matches/rules.ts`.
 *
 * A board rather than a list because the work is moving things along: five
 * columns left to right, with Rejected as a lane a card can drop into from any
 * of them rather than a sixth column at the end — a rejection is not the last
 * stage of a match, it is the end of one.
 *
 * Every card can be dragged, and every move a drag can make is also a command
 * in the card's menu. Not a fallback: the menu is how this works with a
 * keyboard, a screen reader and a phone, and a board that could only be driven
 * by dragging would be a board half the people who need it can't use.
 */
export function MatchBoard() {
  const workspace = useWorkspace();
  const cards = useQuery(api.matches.queries.board, {
    matchmakerId: workspace.matchmakerId,
  });
  const moveStage = useMutation(api.matches.mutations.moveStage);
  const closeMatch = useMutation(api.matches.mutations.close);
  const markSeen = useMutation(api.matches.mutations.markSeen);
  const refresh = useMutation(api.matches.mutations.refresh);

  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [running, setRunning] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [over, setOver] = useState<MatchStage | null>(null);

  /** Every write goes through here, so one failed move can't be silent. */
  async function attempt(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
    } catch (thrown) {
      setError(serverErrorMessage(thrown, "That didn't work. Try again."));
    }
  }

  const actions = (card: BoardCard): CardActions => ({
    onMove: (stage) =>
      void attempt(() =>
        moveStage({
          matchmakerId: workspace.matchmakerId,
          matchId: card.matchId,
          stage,
        }),
      ),
    onClose: (closing) =>
      void attempt(() =>
        closeMatch({
          matchmakerId: workspace.matchmakerId,
          matchId: card.matchId,
          outcome: closing.outcome,
          closedBy: closing.closedBy,
          note: closing.note,
          archiveBoth: closing.archiveBoth,
        }),
      ),
    // Quietly: a card stopping being new is not something to interrupt
    // somebody about if it fails, and the next look will try again.
    onSeen: () =>
      void markSeen({
        matchmakerId: workspace.matchmakerId,
        matchId: card.matchId,
      }).catch(() => {}),
    conversationPath: (which, side) =>
      `/mm/${workspace.username}/c/${side === "a" ? which.a.candidateId : which.b.candidateId}`,
  });

  function drop(stage: MatchStage) {
    return (event: DragEvent) => {
      event.preventDefault();
      setOver(null);
      const matchId = event.dataTransfer.getData("text/plain");
      const card = (cards ?? []).find((one) => one.matchId === matchId);
      if (card === undefined || card.stage === stage) return;
      void attempt(() =>
        moveStage({
          matchmakerId: workspace.matchmakerId,
          matchId: card.matchId,
          stage,
        }),
      );
    };
  }

  async function findMatches() {
    setRunning(true);
    setError(null);
    try {
      setReport(await refresh({ matchmakerId: workspace.matchmakerId }));
    } catch (thrown) {
      setError(serverErrorMessage(thrown, "The run didn't finish. Try again."));
    } finally {
      setRunning(false);
    }
  }

  const closed = cards === undefined ? [] : cardsInStage(cards, "closed");

  return (
    <main
      // Fills the workspace's frame and scrolls inside itself, the way the
      // chat shell does: a board is a surface you work on, and its one
      // horizontal scrollbar belongs at the bottom of the window rather than
      // wherever the tallest column happens to end.
      //
      // **No minimum height, and `min-h-0` so there is no implied one either.**
      // A minimum used to sit here, and on a short window it made the frame
      // scroll past the bottom of the board into nothing at all: the columns
      // had already given up their slack, so there was nothing under there to
      // find. `min-h-0` is the other half of it — a flex item will not shrink
      // below its content by default, and everything inside this one scrolls,
      // so its content must not be allowed to set a floor.
      //
      // Being exactly the frame's height is also what makes the percentage
      // caps below work: a percentage resolves against a definite height and
      // is ignored against an automatic one.
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-4 py-6"
      data-testid="match-board"
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-3xl">Matches</h1>
          <p className="text-sm text-muted-foreground">
            Found every night from the profiles in your book, and scored by the
            same rules every time. No AI: every card says what it read.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => setPairing(!pairing)}
            data-testid="pair-two-people"
          >
            Pair two people
          </Button>
          <Button
            onClick={findMatches}
            disabled={running}
            data-testid="find-matches"
          >
            {running ? "Looking…" : "Find matches"}
          </Button>
        </div>
      </div>

      {pairing && <NewMatch onDone={() => setPairing(false)} />}

      {report !== null && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="run-summary"
          aria-live="polite"
        >
          {runSummary(report)}
        </p>
      )}

      {error !== null && (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-testid="board-error"
        >
          {error}
        </p>
      )}

      {cards === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* Scrolls sideways as a board does, and takes every pixel of height
              the header above it didn't. The columns share the width when
              there is enough of it and stop at a readable 18rem when there
              isn't, which is when this starts scrolling. No floor: a column
              that runs out of room scrolls its own cards, which is a better
              answer than a page that scrolls to reach it. */}
          <div className="-mx-4 flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto px-4 pb-2">
            {MATCH_BOARD_STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                cards={cardsInStage(cards, stage)}
                actions={actions}
                over={over === stage}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(stage);
                }}
                onDragLeave={() =>
                  setOver((current) => (current === stage ? null : current))
                }
                onDrop={drop(stage)}
              />
            ))}
          </div>

          <ClosedSection
            cards={closed}
            actions={actions}
            open={showClosed}
            onOpenChange={setShowClosed}
          />
        </>
      )}
    </main>
  );
}

function Column({
  stage,
  cards,
  actions,
  over,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  stage: MatchStage;
  cards: BoardCard[];
  actions: (card: BoardCard) => CardActions;
  over: boolean;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent) => void;
}) {
  const headingId = `match-column-${stage}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="match-column"
      data-stage={stage}
      data-over={over}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex min-w-72 flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
        over ? "border-primary bg-accent/50" : "border-transparent bg-muted/40",
      )}
    >
      <div className="flex shrink-0 flex-col gap-0.5 px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id={headingId} className="text-sm font-medium">
            {MATCH_STAGE_LABELS[stage]}
          </h2>
          <span
            className="text-xs text-muted-foreground"
            data-testid="match-column-count"
          >
            {cards.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {MATCH_STAGE_DESCRIPTIONS[stage]}
        </p>
      </div>
      {/* The cards scroll, not the board: a column with thirty suggestions in
          it should not push the other four off the bottom of the screen. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {cards.map((card) => (
          <MatchCard key={card.matchId} card={card} actions={actions(card)} />
        ))}
        {cards.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {stage === "proposed"
              ? "Nothing proposed yet."
              : "Drop a card here."}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * What is over, under the board (prd/phase-3.md §2).
 *
 * Not a column and not a lane: a match that has ended — well or badly — is not
 * at a stage any more, and a board whose last column fills up for ever is a
 * board that gets worse the better you are at your job. So it collapses to one
 * line that counts them, and opens when somebody wants it.
 *
 * Nothing ages out. What a match ended as, and why, is the one thing worth
 * keeping of it.
 */
function ClosedSection({
  cards,
  actions,
  open,
  onOpenChange,
}: {
  cards: BoardCard[];
  actions: (card: BoardCard) => CardActions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <section
      aria-labelledby="match-closed-heading"
      data-testid="match-closed"
      data-open={open}
      className="flex shrink-0 flex-col gap-2"
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        data-testid="match-closed-toggle"
        className="flex items-center gap-2 self-start rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span aria-hidden className="text-xs">
          {open ? "▾" : "▸"}
        </span>
        <span id="match-closed-heading">{closedSummary(cards)}</span>
      </button>
      {open && (
        <div className="-mx-1 flex max-h-[min(45%,18rem)] gap-2 overflow-y-auto overflow-x-auto px-1 pb-1">
          {cards.map((card) => (
            <div key={card.matchId} className="w-72 shrink-0">
              <MatchCard card={card} actions={actions(card)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
