import {
  closingNeedsWho,
  closingNoteError,
  MATCH_BOARD_STAGES,
  MATCH_CLOSED_BY_CHOICES,
  MATCH_CLOSED_BY_LABELS,
  MATCH_LIMITS,
  MATCH_OUTCOME_BADGES,
  MATCH_OUTCOME_LABELS,
  MATCH_OUTCOMES,
  MATCH_STAGE_LABELS,
  type MatchClosedBy,
  type MatchOutcome,
  type MatchStage,
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
  closingLine,
  isSeen,
  personName,
  scoreLine,
  scoreTone,
} from "./cards";

/** How a match ends, as the close form hands it over. */
export type Closing = {
  outcome: MatchOutcome;
  closedBy?: MatchClosedBy;
  note: string;
  /** Take both of them out of the book. Only offered when they're together. */
  archiveBoth: boolean;
};

/** What a card can be asked to do. Every one of them is the board's to perform. */
export type CardActions = {
  onMove: (stage: MatchStage) => void;
  onClose: (closing: Closing) => void;
  /** Called the first time the matchmaker opens a card they hadn't seen. */
  onSeen: () => void;
  /** Where a candidate's conversation is, for the names on the card. */
  conversationPath: (card: BoardCard, side: "a" | "b") => string;
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
  const [closing, setClosing] = useState(false);
  const reasons = open ? allReasons(card) : cardReasons(card);
  const score = scoreLine(card);
  const tone = scoreTone(card.score);
  const isNew = card.stage === "proposed" && !isSeen(card);

  /** Reading a card is what makes it no longer new. */
  function look() {
    if (isNew) actions.onSeen();
  }

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
      data-new={isNew}
      onPointerDown={look}
      className={cn(
        "flex cursor-grab flex-col gap-2 rounded-xl border bg-card p-3 text-left shadow-sm transition-opacity active:cursor-grabbing",
        dimmed && "opacity-60",
        isNew ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-medium leading-snug">
          {isNew && (
            <>
              {/* The dot is decoration; the words are what a screen reader
                  gets, since "new" is not a colour. */}
              <span
                aria-hidden
                data-testid="match-card-new"
                className="mr-1.5 inline-block size-1.5 shrink-0 rounded-full bg-primary align-middle"
              />
              <span className="sr-only">Not looked at yet. </span>
            </>
          )}
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
          onClose={() => {
            look();
            setClosing(true);
          }}
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
        {card.stage === "closed" && card.closedAs !== undefined && (
          <span
            data-testid="match-card-outcome"
            data-outcome={card.closedAs}
            className={cn(
              "rounded-md px-1.5 py-0.5 font-medium",
              card.closedAs === "together"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {MATCH_OUTCOME_BADGES[card.closedAs]}
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

      {card.stage === "closed" && closingLine(card) !== null && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="match-card-closing"
        >
          {closingLine(card)}
        </p>
      )}

      {(card.signals?.length ?? 0) > cardReasons(card).length && (
        <button
          type="button"
          onClick={() => {
            look();
            setOpen(!open);
          }}
          className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="match-card-expand"
          aria-expanded={open}
        >
          {open ? "Fewer reasons" : `All ${card.signals?.length} reasons`}
        </button>
      )}

      {closing && (
        <CloseForm
          card={card}
          onCancel={() => setClosing(false)}
          onClose={(record) => {
            setClosing(false);
            actions.onClose(record);
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
  onClose,
}: {
  card: BoardCard;
  actions: CardActions;
  onClose: () => void;
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
      {card.stage !== "closed" && (
        <MenuItem onClick={onClose} data-testid="match-close">
          Close it…
        </MenuItem>
      )}
    </Menu>
  );
}

/**
 * How a match ended, and what to do about it.
 *
 * One form for both endings, because they are one event (prd/phase-3.md §2).
 * The outcome is picked first and the rest follows from it: a no asks whose it
 * was, because that is the taste signal the board collects; a yes asks nothing
 * except whether these two should come out of the book, which is the honest
 * consequence of having found each other.
 */
function CloseForm({
  card,
  onCancel,
  onClose,
}: {
  card: BoardCard;
  onCancel: () => void;
  onClose: (closing: Closing) => void;
}) {
  const [outcome, setOutcome] = useState<MatchOutcome>("didnt_work");
  const [by, setBy] = useState<MatchClosedBy>("matchmaker");
  const [note, setNote] = useState("");
  const [archiveBoth, setArchiveBoth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The two candidates by name; everything else by what it is.
  const label = (who: MatchClosedBy) =>
    who === "candidateA"
      ? personName(card.a)
      : who === "candidateB"
        ? personName(card.b)
        : MATCH_CLOSED_BY_LABELS[who];

  function submit(event: FormEvent) {
    event.preventDefault();
    const bad = closingNoteError(outcome, note);
    setError(bad);
    if (bad !== null) return;
    onClose({
      outcome,
      closedBy: closingNeedsWho(outcome) ? by : undefined,
      note,
      archiveBoth: outcome === "together" && archiveBoth,
    });
    setNote("");
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2"
      onSubmit={submit}
      data-testid="close-form"
    >
      <p className="text-xs font-medium">How did it end?</p>
      <div className="flex flex-wrap gap-1">
        {MATCH_OUTCOMES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={outcome === option}
            onClick={() => setOutcome(option)}
            data-testid={`close-as-${option}`}
            className={cn(
              "rounded-md border px-2 py-1 text-xs transition-colors",
              outcome === option
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {MATCH_OUTCOME_LABELS[option]}
          </button>
        ))}
      </div>

      {closingNeedsWho(outcome) && (
        <>
          <p className="text-xs font-medium">Who ended it?</p>
          <div className="flex flex-wrap gap-1">
            {MATCH_CLOSED_BY_CHOICES.map((who) => (
              <button
                key={who}
                type="button"
                aria-pressed={by === who}
                onClick={() => setBy(who)}
                data-testid={`close-by-${who}`}
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
        </>
      )}

      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={MATCH_LIMITS.closingNote}
        rows={3}
        className="min-h-16 text-sm"
        placeholder={
          outcome === "together"
            ? "Anything worth remembering about it?"
            : "Why? Even a few words — it's what the board learns from."
        }
        aria-label="What happened"
        data-testid="close-note"
      />

      {outcome === "together" && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={archiveBoth}
            onChange={(event) => setArchiveBoth(event.target.checked)}
            data-testid="close-archive-both"
            className="mt-0.5"
          />
          <span>
            Archive both of them — they're not looking any more. You can
            reactivate either from your list.
          </span>
        </label>
      )}

      {error !== null && (
        <p className="text-xs text-destructive" data-testid="close-error">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" data-testid="close-submit">
          Close it
        </Button>
      </div>
    </form>
  );
}
