import { Button, cn, Popover, PopoverClose, PopoverTitle } from "@repo/ui";
import { useState } from "react";
import { Link } from "react-router";
import {
  bellLabel,
  initials,
  type Notification,
  type NotificationKind,
  timeAgo,
  unreadBadge,
  unreadCount,
  unreadIds,
} from "./notifications";

/**
 * What's happened since you last looked, under the bell in the header.
 *
 * An overlay rather than a side drawer: a notification is read in passing and
 * then either acted on or ignored, so it should sit over the page for a
 * second and leave. A drawer asks the page to move aside for it, which is the
 * right gesture for something you work inside — the candidate panel — and the
 * wrong one for a list you glance at.
 *
 * Presentational on purpose. It takes the list and one callback and owns
 * nothing: what a notification *is*, when it becomes read and where it goes
 * are decided by the caller, so the wiring can change without touching this.
 *
 * Opening it is what marks everything read — there is no "mark all read"
 * button, because looking is the only thing that button ever meant. What the
 * panel *shows* doesn't follow: the dots are snapshotted at open, so the list
 * still says which ones were new for as long as it is on screen. The bell
 * behind it goes quiet immediately, which is the honest answer to "is there
 * anything I haven't seen".
 */
export function NotificationsMenu({
  items,
  onOpen,
}: {
  /** Newest first. */
  items: Notification[];
  /** Called as the panel opens — where "read" is written, for all of them. */
  onOpen?: () => void;
}) {
  // Read when the panel opens, so "3m" is three minutes ago now rather than
  // when the page loaded. A ticking clock would re-render the whole header
  // once a minute to change a character nobody is looking at.
  const [now, setNow] = useState(() => Date.now());
  const [wasUnread, setWasUnread] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) return;
        setNow(Date.now());
        setWasUnread(unreadIds(items));
        onOpen?.();
      }}
      className="w-[min(22rem,calc(100vw-1.5rem))]"
      trigger={bellTrigger(unreadCount(items))}
    >
      <div className="border-b border-border px-3 py-2">
        <PopoverTitle>Notifications</PopoverTitle>
      </div>

      {items.length === 0 ? (
        <p
          className="px-3 py-8 text-center text-sm text-muted-foreground"
          data-testid="notifications-empty"
        >
          You're all caught up.
        </p>
      ) : (
        <ul
          className="max-h-[min(24rem,60vh)] overflow-y-auto py-1"
          data-testid="notifications-list"
        >
          {items.map((item) => (
            <li key={item.id}>
              <NotificationRow
                item={item}
                now={now}
                unread={wasUnread.has(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

/**
 * The bell, with the count of what's waiting.
 *
 * A function returning the element rather than a component, because Base UI
 * hands the trigger its own props and ref: an element of our own component
 * would have to forward both, and a `<Button>` already does.
 *
 * The badge is `aria-hidden` and the number is in the button's label instead:
 * read out, "Notifications 3" is ambiguous in a way "3 unread" isn't.
 */
function bellTrigger(unread: number) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative"
      aria-label={bellLabel(unread)}
      title="Notifications"
      data-testid="notifications-trigger"
      data-unread={unread}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
        <path d="M10.3 20a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          data-testid="notifications-badge"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-medium leading-none text-primary-foreground"
        >
          {unreadBadge(unread)}
        </span>
      )}
    </Button>
  );
}

const ROW =
  "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground";

/**
 * One notification. A link where there is somewhere to go — closing the
 * panel on the way, since the page behind it is about to change — and plain
 * text where there isn't, rather than a control that looks clickable and
 * isn't.
 *
 * `unread` comes from the panel's snapshot rather than `item.read`, which by
 * the time this renders is already true of everything.
 */
function NotificationRow({
  item,
  now,
  unread,
}: {
  item: Notification;
  now: number;
  unread: boolean;
}) {
  const body = (
    <>
      <Bubble kind={item.kind} title={item.title} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-sm", unread && "font-medium")}>
            {item.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {timeAgo(item.at, now)}
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
          {item.body}
        </span>
      </span>
      {/* The dot repeats what the weight already says, for anyone who can't
          see weight. Hidden from assistive tech: "New" is on the row. */}
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
    </>
  );

  const shared = {
    "data-testid": "notification",
    "data-unread": unread,
    "aria-label": unread
      ? `New. ${item.title}: ${item.body}`
      : `${item.title}: ${item.body}`,
  };

  if (item.href === undefined) {
    return (
      <div className={cn(ROW, "cursor-default")} {...shared}>
        {body}
      </div>
    );
  }
  return (
    <PopoverClose
      render={
        <Link to={item.href} className={ROW} {...shared}>
          {body}
        </Link>
      }
    />
  );
}

const BUBBLE: Record<NotificationKind, string> = {
  message: "bg-secondary text-secondary-foreground",
  invite: "bg-accent text-accent-foreground",
  system: "bg-muted text-muted-foreground",
};

function Bubble({ kind, title }: { kind: NotificationKind; title: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
        BUBBLE[kind],
      )}
    >
      {kind === "system" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      ) : (
        initials(title)
      )}
    </span>
  );
}
