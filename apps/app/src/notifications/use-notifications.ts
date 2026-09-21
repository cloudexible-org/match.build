import { useCallback, useMemo, useState } from "react";
import type { Notification } from "./notifications";

/**
 * The seam between the notifications overlay and where notifications will
 * come from.
 *
 * TEMPORARY: this returns a fixed sample so the UI can be looked at and
 * judged before there is anything to read. Wiring it up means replacing the
 * body — a `useQuery(api.notifications.queries.recent)` for the list, and a
 * mutation behind `markAllRead` — and deleting `SAMPLE`. The component above
 * it takes a list and one callback and doesn't care which of those two
 * worlds it is in.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const SAMPLE = (now: number): Notification[] => [
  {
    id: "1",
    kind: "message",
    title: "Amara Osei",
    body: "That sounds good — Thursday evening works for me. Should I book somewhere?",
    at: now - 2 * MINUTE,
    read: false,
    href: "/",
  },
  {
    id: "2",
    kind: "message",
    title: "Daniel Whitfield",
    body: "Thanks for the intro! I had a look at her profile and I'd be up for meeting.",
    at: now - 3 * HOUR,
    read: false,
    href: "/",
  },
  {
    id: "3",
    kind: "invite",
    title: "Priya Raman",
    body: "Accepted your invite and finished her profile.",
    at: now - 2 * DAY,
    read: false,
    href: "/",
  },
  {
    id: "4",
    kind: "system",
    title: "match.build",
    body: "Your workspace is live. Invite a candidate to get started.",
    at: now - 9 * DAY,
    read: true,
  },
];

export function useNotifications(): {
  items: Notification[];
  markAllRead: () => void;
} {
  const [seen, setSeen] = useState(false);
  const base = useMemo(() => SAMPLE(Date.now()), []);

  const items = useMemo(
    () => (seen ? base.map((item) => ({ ...item, read: true })) : base),
    [base, seen],
  );

  const markAllRead = useCallback(() => setSeen(true), []);

  return { items, markAllRead };
}
