/**
 * Grouping the History trail by the day each event landed on
 * (prd/phase-1.md §5.2).
 *
 * The trail used to stamp every entry with a full date *and* a time — "Sep
 * 21, 2026, 5:54 PM" under each of twenty lines, nineteen of which happened
 * on the same afternoon. The day belongs to the run of events that share it;
 * the entry keeps only what distinguishes it.
 *
 * Local dates throughout: a matchmaker's "today" is theirs, not UTC's.
 */

const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** A stable key for the local calendar day a timestamp falls on. */
export function dayKey(time: number): string {
  const at = new Date(time);
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}

/** "Today", "Yesterday", or the date — read against `now`, never `Date.now()`. */
export function dayLabel(time: number, now: number): string {
  const key = dayKey(time);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(now - 86_400_000)) return "Yesterday";
  return dayFormat.format(time);
}

export type DayGroup<Event> = {
  key: string;
  label: string;
  events: Event[];
};

/**
 * Consecutive runs of events that share a day, in the order given — which is
 * newest first, and stays that way. Runs rather than a keyed bucket: paging
 * appends older events, and an out-of-order event should show where it sits
 * rather than teleport into an earlier heading.
 */
export function groupByDay<Event extends { _creationTime: number }>(
  events: Event[],
  now: number,
): DayGroup<Event>[] {
  const groups: DayGroup<Event>[] = [];
  for (const event of events) {
    const key = dayKey(event._creationTime);
    const last = groups.at(-1);
    if (last !== undefined && last.key === key) {
      last.events.push(event);
      continue;
    }
    groups.push({
      key,
      label: dayLabel(event._creationTime, now),
      events: [event],
    });
  }
  return groups;
}
