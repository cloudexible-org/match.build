/**
 * Notification timing, throttles and copy (prd/phase-1.md §8, §8.1). Plain
 * code with no Convex imports, exported through `@repo/api` so the app can
 * label the settings it offers with the same delays the server uses.
 *
 * The whole design rests on one idea: a notification is a **fallback** for
 * something you didn't see. Nothing is sent at the moment a message is
 * written; a job is scheduled, and when it fires it asks whether the message
 * has been read since. Read markers (§8.1) are the only source of truth.
 */

import type { EmailMessage } from "../email/rules";

/**
 * How long after a message each channel waits before it gives up on you.
 *
 * These are the spec's starting points, and prd/phase-1.md §12 expects them to
 * be tuned with the first matchmaker — so a deployment can override them
 * (`NOTIFICATION_PUSH_DELAY_SECONDS`, `NOTIFICATION_EMAIL_DELAY_SECONDS`)
 * without a code change. `notificationDelays` is what reads them.
 */
export const PUSH_DELAY_MS = 30 * 1000;
export const EMAIL_DELAY_MS = 5 * 60 * 1000;

/**
 * The delays this deployment uses. A blank, absent or nonsensical value falls
 * back to the default rather than failing a send — a mistyped env var must not
 * stop notifications going out — and zero is a legitimate value (the e2e suite
 * uses it to exercise the real path without waiting five minutes).
 */
export function notificationDelays(
  pushSeconds: string | undefined,
  emailSeconds: string | undefined,
): { pushMs: number; emailMs: number } {
  return {
    pushMs: seconds(pushSeconds, PUSH_DELAY_MS),
    emailMs: seconds(emailSeconds, EMAIL_DELAY_MS),
  };
}

function seconds(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1000 : fallback;
}

/**
 * Push is capped at one per conversation per minute. A message that arrives
 * inside that window doesn't lose its notification — it is scheduled for the
 * end of the window instead (`nextPushAt`).
 */
export const PUSH_INTERVAL_MS = 60 * 1000;

export const NOTIFICATION_CHANNELS = ["push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Both channels are on for a new account; `/settings` turns them off. */
export const DEFAULT_NOTIFICATION_SETTINGS = {
  emailEnabled: true,
  pushEnabled: true,
} as const;

/**
 * When a push for this conversation may next go out: the usual delay, or the
 * end of the one-per-minute window when one has just been sent.
 */
export function nextPushAt(
  now: number,
  lastSentAt: number | undefined,
  pushDelayMs: number = PUSH_DELAY_MS,
): number {
  const earliest = now + pushDelayMs;
  if (lastSentAt === undefined) return earliest;
  return Math.max(earliest, lastSentAt + PUSH_INTERVAL_MS);
}

/**
 * Why a channel isn't being scheduled for a message, or `null` to schedule it.
 *
 * - `pending`: a job for this (conversation, recipient, channel) is already
 *   scheduled. The later message rides on it — the job re-reads the
 *   conversation when it fires, so it will cover this message too.
 * - `unread_email`: an email has already been sent for this conversation and
 *   the recipient still hasn't read it. Another one says nothing new (§8.1).
 */
export type SkipScheduling = "pending" | "unread_email";

export function skipScheduling(args: {
  channel: NotificationChannel;
  /** The existing row for this (conversation, recipient, channel), if any. */
  existing?: { status: string; triggerSeq: number };
  /** How far the recipient has read in this conversation. */
  readSeq: number;
}): SkipScheduling | null {
  const existing = args.existing;
  if (existing === undefined) return null;
  if (existing.status === "scheduled") return "pending";
  if (
    args.channel === "email" &&
    existing.status === "sent" &&
    args.readSeq < existing.triggerSeq
  ) {
    return "unread_email";
  }
  return null;
}

/*
 * ─── Where a notification points ────────────────────────────────────────────
 *
 * Paths relative to the app's base URL, as `invitePath` is. The app is mounted
 * under a base path (`/app/` today), so the server joins them to `SITE_URL`.
 */

/** The matchmaker's view of one candidate's conversation. */
export function workspaceConversationPath(
  matchmakerUsername: string,
  candidateId: string,
): string {
  return `mm/${matchmakerUsername}/c/${candidateId}`;
}

/**
 * The candidate's own chat with one matchmaker. The shell is one route
 * (`c`) and the hash picks the matchmaker, so the whole list and the
 * conversation arrive together.
 */
export function candidateChatPath(matchmakerUsername: string): string {
  return `c#${matchmakerUsername}`;
}

/*
 * ─── What a notification says ───────────────────────────────────────────────
 *
 * **Never the message.** A conversation here can carry someone's sexuality,
 * religion or health (prd §9.3), and a notification is read on a lock screen
 * and in an inbox list that other people see. Every one of these says only
 * that there is something to read, and who from.
 */

/** Must be on a domain verified in Resend (see `email/rules.ts`). */
export const NOTIFICATION_FROM = "match.build <notifications@match.build>";

export function newMessageEmail(args: {
  fromName: string;
  link: string;
}): EmailMessage {
  const { fromName, link } = args;
  return {
    subject: `You have a new message from ${fromName}`,
    text: [
      `${fromName} sent you a message on match.build.`,
      "",
      `Read it: ${link}`,
      "",
      "You can turn these emails off in your account settings.",
    ].join("\n"),
    html: [
      `<p>${escapeHtml(fromName)} sent you a message on match.build.</p>`,
      `<p><a href="${escapeHtml(link)}">Read it</a></p>`,
      `<p>You can turn these emails off in your account settings.</p>`,
    ].join(""),
  };
}

/** What happened to a candidate's membership, for the matchmaker's email. */
export type MembershipEvent = "accepted" | "left" | "account_deleted";

export function membershipEmail(args: {
  candidateName: string;
  event: MembershipEvent;
  link: string;
}): EmailMessage {
  const { candidateName: name, link } = args;
  const subject = {
    accepted: `${name} accepted your invitation`,
    left: `${name} left`,
    account_deleted: `${name} deleted their match.build account`,
  }[args.event];
  const line = {
    accepted: `${name} accepted your invitation and can now message you on match.build.`,
    left: `${name} has left. Your conversation, notes and history are all still there, and you can invite them back.`,
    account_deleted: `${name} deleted their match.build account. Your conversation, notes and history are all still there.`,
  }[args.event];
  return {
    subject,
    text: [line, "", `Open their conversation: ${link}`].join("\n"),
    html: [
      `<p>${escapeHtml(line)}</p>`,
      `<p><a href="${escapeHtml(link)}">Open their conversation</a></p>`,
    ].join(""),
  };
}

/** The payload `apps/app/public/sw.js` expects. */
export type PushPayload = { title: string; body: string; url: string };

export function newMessagePush(args: {
  fromName: string;
  url: string;
}): PushPayload {
  return {
    title: args.fromName,
    body: "Sent you a message",
    url: args.url,
  };
}

export function membershipPush(args: {
  candidateName: string;
  event: MembershipEvent;
  url: string;
}): PushPayload {
  const body = {
    accepted: "Accepted your invitation",
    left: "Left",
    account_deleted: "Deleted their account",
  }[args.event];
  return { title: args.candidateName, body, url: args.url };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * ─── The in-app panel ───────────────────────────────────────────────────────
 *
 * The bell in the app's header (§8.1's third channel, alongside push and
 * email). Its list is **derived**, not stored: a conversation with messages
 * past the reader's marker, a membership that changed, an invitation waiting.
 * Nothing writes a feed row, so nothing can disagree with the conversation it
 * describes.
 *
 * "Read" is one watermark per account — `notificationSettings.feedSeenAt`,
 * set when the panel opens. An item is new when it happened after it. That is
 * deliberately not the same as having read the *message*: the conversation's
 * own marker still only moves when the thread is open (§8.1), so glancing at
 * the bell clears the bell and nothing else.
 *
 * Like every other notification here, an item says who and never what
 * (§9.3) — "3 new messages", not the messages.
 */

/** What the panel shows at most. Older than this belongs in the workspace. */
export const MAX_FEED_ITEMS = 20;

/**
 * How many profiles of one kind an account is read for. Well past anything
 * real; it stops one account's feed from being unbounded work.
 */
export const MAX_FEED_PROFILES = 10;

export type FeedKind = "message" | "invite" | "system";

export type FeedItem = {
  id: string;
  kind: FeedKind;
  /** Who it is about: the other person's name. */
  title: string;
  body: string;
  at: number;
  /** Path within the app, leading slash included. */
  href: string;
};

/** Never the message, only how much of it there is. */
export function unreadMessageBody(unread: number): string {
  return unread === 1 ? "Sent you a message" : `${unread} new messages`;
}

/**
 * What a membership change says to the matchmaker whose candidate it is, or
 * `null` for one they aren't told about (§8.1 names three).
 *
 * "Accepted" is an `invite`, the other two are `system`: one is a person
 * arriving, the others are the record closing. It is the only difference the
 * panel draws between them.
 */
export function membershipFeedEntry(
  membership: "invited" | "declined" | "joined" | "left" | "account_deleted",
): { kind: FeedKind; body: string } | null {
  switch (membership) {
    case "joined":
      return { kind: "invite", body: "Accepted your invitation" };
    case "left":
      return { kind: "system", body: "Left your workspace" };
    case "account_deleted":
      return { kind: "system", body: "Deleted their account" };
    default:
      return null;
  }
}

/**
 * How far back a membership change is still news. A message item disappears
 * when the message is read, but nothing ever "reads" an acceptance — without
 * a window, a quiet workspace's panel would be a list of who joined it last
 * year. An invitation has no window: it is waiting on an answer for as long
 * as it is open, and it expires on its own.
 */
export const MEMBERSHIP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function withinMembershipWindow(at: number, now: number): boolean {
  return now - at < MEMBERSHIP_WINDOW_MS;
}

/** What an open invitation says to the person it is waiting for. */
export function invitationBody(): string {
  return "Invited you to connect";
}

/**
 * Newest first, capped. The cap is applied after sorting, so a busy
 * matchmaker's twenty-first conversation drops off rather than an arbitrary
 * one from whichever source was read first.
 */
export function newestFirst(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => b.at - a.at).slice(0, MAX_FEED_ITEMS);
}

/**
 * Whether the panel shows this as new. `undefined` is an account that has
 * never opened it, for which everything is.
 */
export function isNew(at: number, seenAt: number | undefined): boolean {
  return seenAt === undefined || at > seenAt;
}
