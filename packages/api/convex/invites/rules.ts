/**
 * Invitation rules and the invite email (prd/phase-1.md §3.2, §8). Plain
 * code with no Convex imports, exported through `@repo/api`.
 */

import type { EmailMessage } from "../email/rules";

/** An invite link works for 30 days, then a scheduled job clears it. */
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The longest hop the expiry job schedules itself for; it re-schedules until
 * the invite's `expiresAt`. Convex's scheduler takes any time, but JavaScript
 * timers (and so convex-test, which runs the scheduler on them) overflow past
 * 2^31 ms, about 24.8 days, and fire at once.
 */
export const INVITE_EXPIRY_HOP_MS = 20 * 24 * 60 * 60 * 1000;

/** How many times a day the matchmaker may send an invite's email. */
export const INVITE_SENDS_PER_DAY = 3;
export const INVITE_SEND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The app path an invite token opens, relative to the app's base URL. */
export function invitePath(token: string): string {
  return `invite/${token}`;
}

/**
 * The invite email's sender: the matchmaker's display name (prd §8) on the
 * verified sending domain (`aileenlancif.com`, prd §10, like the sign-in
 * codes). The name is
 * the matchmaker's own text, so anything that could break out of the quoted
 * display name is dropped.
 */
export function inviteFrom(matchmakerName: string): string {
  const name =
    matchmakerName.replace(/["<>\\\r\n]/g, "").trim() || "Your matchmaker";
  return `"${name}" <invites@aileenlancif.com>`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "19 October 2026", in UTC: the email can't know the reader's zone. */
export function formatEmailDate(time: number): string {
  const date = new Date(time);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function inviteEmail(args: {
  matchmakerName: string;
  link: string;
  expiresAt: number;
}): EmailMessage {
  const name = args.matchmakerName;
  const until = formatEmailDate(args.expiresAt);
  return {
    subject: `${name} invited you to Matchmaker`,
    text: [
      `${name} has invited you to continue your conversation on Matchmaker.`,
      "",
      `Accept the invitation: ${args.link}`,
      "",
      `The link works until ${until}. If you weren't expecting this, you can ignore this email.`,
    ].join("\n"),
    html: [
      `<p>${escapeHtml(name)} has invited you to continue your conversation on Matchmaker.</p>`,
      `<p><a href="${escapeHtml(args.link)}">Accept the invitation</a></p>`,
      `<p>The link works until ${until}. If you weren't expecting this, you can ignore this email.</p>`,
    ].join(""),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
