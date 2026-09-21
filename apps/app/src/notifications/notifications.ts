/**
 * What the notifications overlay shows, and the pure bits of how it reads.
 *
 * The shape here is deliberately the *view's* shape, not the database's: a
 * notification is a line of text, a time and whether it has been seen. What
 * produces one — a message arriving, an invite accepted — is the wiring's
 * problem, and mapping a Convex row onto this type is the seam where that
 * decision lands.
 */

/** Only changes the icon; the text carries the meaning. */
export type NotificationKind = "message" | "invite" | "system";

export type Notification = {
  id: string;
  kind: NotificationKind;
  /** Who or what it is about: a person's name, or the product's. */
  title: string;
  /** One line of detail — for a message, its opening words. */
  body: string;
  /** When it happened, epoch ms. */
  at: number;
  /** False until the person has seen it. Drives the dot and the count. */
  read: boolean;
  /** Where selecting it goes, if anywhere. */
  href?: string;
};

/**
 * The ids that are unread right now.
 *
 * Taken as the panel opens and held while it is: opening marks everything
 * read, and without a snapshot every dot would vanish under the cursor of
 * the person who opened it to see which ones were new.
 */
export function unreadIds(items: Notification[]): ReadonlySet<string> {
  return new Set(items.filter((item) => !item.read).map((item) => item.id));
}

export function unreadCount(items: Notification[]): number {
  return items.reduce((count, item) => (item.read ? count : count + 1), 0);
}

/**
 * The badge's text. Past nine it stops counting: the number is there to say
 * "several, go look", and three digits in a 1rem circle say nothing at all.
 */
export function unreadBadge(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/** What the bell announces to a screen reader. */
export function bellLabel(count: number): string {
  if (count === 0) return "Notifications";
  return `Notifications, ${count} unread`;
}

const sameYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const otherYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A short age — "now", "5m", "3h", "2d", then a date. Short because it sits
 * on the same line as the name and must never be what wraps it.
 *
 * `now` is a parameter rather than `Date.now()` so the caller decides when
 * the list re-reads the clock, and so this is testable without faking time.
 */
export function timeAgo(at: number, now: number): string {
  const elapsed = now - at;
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  const then = new Date(at);
  const formatter =
    then.getFullYear() === new Date(now).getFullYear() ? sameYear : otherYear;
  return formatter.format(then);
}

/**
 * The initials for the bubble beside a notification. Two letters at most, and
 * the first letter of the last word rather than the second word, so "Jane van
 * Dijk" reads as JD.
 */
export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
