import { Button, cn } from "@repo/ui";
import { useEffect, useRef } from "react";

export type ThreadMessage = {
  _id: string;
  seq: number;
  author: "matchmaker" | "candidate" | "system";
  visibility: "everyone" | "matchmaker";
  source: "typed" | "imported" | "system";
  body: string;
  sentAt: number;
};

const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const day = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

/**
 * A conversation's messages, oldest at the top (prd/phase-1.md §3.3).
 *
 * `mine` says which side is reading, so their own messages sit on the right.
 * Private messages — the imported history, and later system notes — carry the
 * "Only visible to you" badge and a distinct treatment; they are only ever
 * passed in on the matchmaker's side.
 *
 * Scrolls to the newest message as it arrives, unless the reader has scrolled
 * up to read older ones.
 */
export function Thread({
  messages,
  mine,
  emptyState,
  canLoadOlder,
  onLoadOlder,
  loadingOlder,
}: {
  /** Oldest first. */
  messages: ThreadMessage[];
  mine: "matchmaker" | "candidate";
  emptyState: string;
  canLoadOlder: boolean;
  onLoadOlder: () => void;
  loadingOlder: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const latestSeq = messages.at(-1)?.seq ?? 0;

  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    // Only follow the conversation if they're already near the bottom.
    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance < 200) {
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [latestSeq]);

  return (
    <div
      ref={scroller}
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      data-testid="conversation-messages"
    >
      {canLoadOlder && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          disabled={loadingOlder}
          onClick={onLoadOlder}
        >
          {loadingOlder ? "Loading…" : "Load older messages"}
        </Button>
      )}
      {messages.length === 0 ? (
        <p className="m-auto text-sm text-muted-foreground">{emptyState}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {messages.map((message, index) => (
            <Message
              key={message._id}
              message={message}
              mine={mine}
              showDay={startsNewDay(messages[index - 1], message)}
            />
          ))}
        </ol>
      )}
      <div ref={bottom} />
    </div>
  );
}

function startsNewDay(
  previous: ThreadMessage | undefined,
  message: ThreadMessage,
): boolean {
  if (previous === undefined) return true;
  return day.format(previous.sentAt) !== day.format(message.sentAt);
}

function Message({
  message,
  mine,
  showDay,
}: {
  message: ThreadMessage;
  mine: "matchmaker" | "candidate";
  showDay: boolean;
}) {
  const isPrivate = message.visibility === "matchmaker";
  const isMine = !isPrivate && message.author === mine;
  return (
    <li className="flex flex-col gap-3">
      {showDay && (
        <span className="self-center text-xs text-muted-foreground">
          {day.format(message.sentAt)}
        </span>
      )}
      <div
        data-testid="conversation-message"
        data-author={message.author}
        data-visibility={message.visibility}
        className={cn(
          "flex max-w-prose flex-col gap-1 rounded-xl px-4 py-3 text-sm",
          isPrivate
            ? "self-stretch border border-dashed border-border bg-muted/60"
            : isMine
              ? "self-end bg-primary text-primary-foreground"
              : "self-start border border-border bg-card",
        )}
      >
        {isPrivate && (
          <span className="text-xs font-medium text-muted-foreground">
            {message.source === "imported" ? "Imported conversation · " : ""}
            Only visible to you
          </span>
        )}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <span
          className={cn(
            // 85%, not less: 12px text on the primary bubble needs 4.5:1, and
            // 70% fell under it in the light palette (axe, WCAG AA).
            "text-xs",
            isMine ? "text-primary-foreground/85" : "text-muted-foreground",
          )}
        >
          {time.format(message.sentAt)}
        </span>
      </div>
    </li>
  );
}
