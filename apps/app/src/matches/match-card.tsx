import {
  MATCH_BOARD_STAGES,
  MATCH_LIMITS,
  MATCH_REJECTED_BY_LABELS,
  MATCH_STAGE_LABELS,
  type MatchRejectedBy,
  type MatchResponse,
  type MatchStage,
  outcomeError,
  rejectionReasonError,
} from "@repo/api";
import { Button, cn, Menu, MenuItem, Textarea } from "@repo/ui";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { timeAgo } from "../notifications/notifications";
import {
  allReasons,
  type BoardCard,
  cardReasons,
  cardTitle,
  personName,
  RESPONSE_SIDES,
  type ResponseSide,
  rejectionLine,
  responseLine,
  responseOf,
  scoreLine,
  scoreTone,
  sideOf,
} from "./cards";

/** What a card can be asked to do. Every one of them is the board's to perform. */
export type CardActions = {
  onMove: (stage: MatchStage) => void;
  onReject: (rejectedBy: MatchRejectedBy, reason: string) => void;
  onRespond: (side: ResponseSide, response: MatchResponse) => void;
  onOutcome: (outcome: string) => void;
  /** Where a candidate's conversation is, for the names on the card. */
  conversationPath: (card: BoardCard, side: ResponseSide) => string;
};

/**
 * One pair on the board.
 *
 * It leads with who and how well, then with *why* — the reasons the run
 * recorded, including the one that doesn't work. A score on its own is a number
 * to be trusted or not; a score with "Both in Toronto · Both want marriage ·
 * Smoking: never and regularly" is something a matchmaker can disagree with,
 * which is the only useful kind of suggestion.
 *
 * Draggable, and every move is also in the menu. The drag is the nice way on a
 * desktop; the menu is the way that works with a keyboard, a screen reader and
 * a phone, so it is not a fallback but the same command in a second place.
 */
export function MatchCard({
  card,
  actions,
  dimmed,
}: {
  card: BoardCard;
  actions: CardActions;
  /** True while something else is being dragged over another column. */
  dimmed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const reasons = open ? allReasons(card) : cardReasons(card);
  const score = scoreLine(card);
  const tone = scoreTone(card.score);

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", card.matchId);
        event.dataTransfer.effectAllowed = "move";
      }}
      data-testid="match-card"
      data-match-id={card.matchId}
      data-stage={card.stage}
      data-score={card.score ?? ""}
      className={cn(
        "flex cursor-grab flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-opacity active:cursor-grabbing",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-medium leading-snug">
          <Link
            to={actions.conversationPath(card, "a")}
            className="hover:underline"
            data-testid="match-card-a"
          >
            {personName(card.a)}
          </Link>
          <span className="text-muted-foreground"> and </span>
          <Link
            to={actions.conversationPath(card, "b")}
            className="hover:underline"
            data-testid="match-card-b"
          >
            {personName(card.b)}
          </Link>
        </h3>
        <CardMenu
          card={card}
          actions={actions}
          onReject={() => setRejecting(true)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {score !== null && (
          <span
            data-testid="match-card-score"
            className={cn(
              "rounded-md px-1.5 py-0.5 font-medium",
              // A visible ladder: a 71 and an 82 that look the same are two
              // numbers a matchmaker has to read rather than see.
              tone === "strong" && "bg-primary/15 text-primary",
              tone === "fair" && "bg-muted text-foreground",
              tone === "thin" && "bg-muted/60 text-muted-foreground",
            )}
          >
            {score}
          </span>
        )}
        {card.origin === "manual" && (
          <span
            className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground"
            data-testid="match-card-manual"
          >
            Yours
          </span>
        )}
        <span className="text-muted-foreground">
          {timeAgo(card.stageChangedAt, Date.now())}
        </span>
      </div>

      {reasons.length > 0 && (
        <ul
          className="flex flex-col gap-1 text-xs"
          data-testid="match-card-reasons"
        >
          {reasons.map((reason) => (
            <li
              key={reason.key}
              data-testid="match-card-reason"
              data-agrees={reason.agrees}
              className="flex gap-1.5"
            >
              <span
                aria-hidden
                className={cn(
                  "select-none",
                  reason.agrees ? "text-primary" : "text-muted-foreground",
                )}
              >
                {reason.agrees ? "+" : "–"}
              </span>
              <span className="min-w-0">
                <span className="text-muted-foreground">{reason.label}: </span>
                {reason.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {card.checkDealbreakers === true && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="match-card-dealbreakers"
        >
          One of them wrote dealbreakers. Nothing here has read them.
        </p>
      )}

      {card.stage === "introduced" && (
        <Responses card={card} onRespond={actions.onRespond} />
      )}

      {card.stage === "rejected" && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="match-card-rejection"
        >
          {rejectionLine(card)}
        </p>
      )}

      {card.stage === "mutual_interest" && responseLine(card) !== null && (
        <p className="text-xs text-muted-foreground">{responseLine(card)}</p>
      )}

      {card.stage === "connected" && (
        <Outcome card={card} onOutcome={actions.onOutcome} />
      )}

      {(card.signals?.length ?? 0) > cardReasons(card).length && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="match-card-expand"
          aria-expanded={open}
        >
          {open ? "Fewer reasons" : `All ${card.signals?.length} reasons`}
        </button>
      )}

      {rejecting && (
        <RejectForm
          card={card}
          onCancel={() => setRejecting(false)}
          onReject={(by, reason) => {
            setRejecting(false);
            actions.onReject(by, reason);
          }}
        />
      )}
    </article>
  );
}

/** Every move this card can make, as commands. */
function CardMenu({
  card,
  actions,
  onReject,
}: {
  card: BoardCard;
  actions: CardActions;
  onReject: () => void;
}) {
  return (
    <Menu
      trigger={
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Move ${cardTitle(card)}`}
          data-testid="match-card-menu"
          className="-mr-1 -mt-1 h-7 shrink-0 px-2"
        >
          ⋯
        </Button>
      }
    >
      {MATCH_BOARD_STAGES.filter((stage) => stage !== card.stage).map(
        (stage) => (
          <MenuItem
            key={stage}
            onClick={() => actions.onMove(stage)}
            data-testid={`match-move-${stage}`}
          >
            Move to {MATCH_STAGE_LABELS[stage]}
          </MenuItem>
        ),
      )}
      {card.stage !== "rejected" && (
        <MenuItem onClick={onReject} data-testid="match-reject">
          Turn it down…
        </MenuItem>
      )}
    </Menu>
  );
}

/**
 * The two yeses (prd/phase-3.md §2). Recorded by the matchmaker, because
 * nothing in this phase asks a candidate anything — the introduction moment is
 * still undesigned (§6), and a set of buttons here would be the design.
 */
function Responses({
  card,
  onRespond,
}: {
  card: BoardCard;
  onRespond: (side: ResponseSide, response: MatchResponse) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="match-card-responses">
      {RESPONSE_SIDES.map((side) => {
        const answer = responseOf(card, side);
        return (
          <div
            key={side}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="min-w-0 truncate text-muted-foreground">
              {personName(sideOf(card, side))}
            </span>
            <div className="flex shrink-0 gap-1">
              {(["yes", "no"] as const).map((response) => (
                <button
                  key={response}
                  type="button"
                  aria-pressed={answer === response}
                  onClick={() =>
                    onRespond(side, answer === response ? "pending" : response)
                  }
                  data-testid={`match-response-${side}-${response}`}
                  className={cn(
                    "rounded-md border px-2 py-0.5 capitalize transition-colors",
                    answer === response
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {response}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Who turned it down, and why. Both required: the why is the taste signal. */
function RejectForm({
  card,
  onCancel,
  onReject,
}: {
  card: BoardCard;
  onCancel: () => void;
  onReject: (rejectedBy: MatchRejectedBy, reason: string) => void;
}) {
  const [by, setBy] = useState<MatchRejectedBy>("matchmaker");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A person, never the nightly run: `system` is the run's own word for taking
  // a suggestion back, and the server refuses it from anybody else.
  const WHO: MatchRejectedBy[] = ["matchmaker", "candidateA", "candidateB"];
  const label = (who: MatchRejectedBy) =>
    who === "candidateA"
      ? personName(card.a)
      : who === "candidateB"
        ? personName(card.b)
        : MATCH_REJECTED_BY_LABELS.matchmaker;

  function submit(event: FormEvent) {
    event.preventDefault();
    const bad = rejectionReasonError(reason);
    setError(bad);
    if (bad !== null) return;
    onReject(by, reason);
    setReason("");
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2"
      onSubmit={submit}
      data-testid="reject-form"
    >
      <p className="text-xs font-medium">Who turned it down?</p>
      <div className="flex flex-wrap gap-1">
        {WHO.map((who) => (
          <button
            key={who}
            type="button"
            aria-pressed={by === who}
            onClick={() => setBy(who)}
            data-testid={`reject-by-${who}`}
            className={cn(
              "rounded-md border px-2 py-1 text-xs transition-colors",
              by === who
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {label(who)}
          </button>
        ))}
      </div>
      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={MATCH_LIMITS.rejectionReason}
        rows={3}
        className="min-h-16 text-sm"
        placeholder="Why? Even a few words — it's what the board learns from."
        aria-label="Why it was turned down"
        data-testid="reject-reason"
      />
      {error !== null && (
        <p className="text-xs text-destructive" data-testid="reject-error">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" data-testid="reject-submit">
          Turn it down
        </Button>
      </div>
    </form>
  );
}

/** What came of a connected match, in the matchmaker's own words. */
function Outcome({
  card,
  onOutcome,
}: {
  card: BoardCard;
  onOutcome: (outcome: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(card.outcome ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="self-start text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
        data-testid="match-card-outcome"
      >
        {card.outcome ?? "What came of it?"}
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      data-testid="outcome-form"
      onSubmit={(event) => {
        event.preventDefault();
        const bad = outcomeError(text);
        setError(bad);
        if (bad !== null) return;
        onOutcome(text);
        setEditing(false);
      }}
    >
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MATCH_LIMITS.outcome}
        rows={2}
        aria-label="What came of it"
        data-testid="outcome-text"
      />
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setText(card.outcome ?? "");
            setEditing(false);
          }}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" data-testid="outcome-save">
          Save
        </Button>
      </div>
    </form>
  );
}
