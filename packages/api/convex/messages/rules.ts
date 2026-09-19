/**
 * Message rules (prd/phase-1.md §3.3), shared by the messages mutations and
 * the app's composer. Plain code with no Convex imports, exported through
 * `@repo/api`.
 */

export const MESSAGE_LIMITS = {
  /** Long enough for anything typed in a chat; far below Convex's 1 MB row. */
  body: 5_000,
} as const;

/** Trims the ends and normalises line endings; inner line breaks are kept. */
export function normaliseMessageBody(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

/** Returns an error message, or `null` when the (raw) message can be sent. */
export function messageBodyError(raw: string): string | null {
  const body = normaliseMessageBody(raw);
  if (!body) return "Write a message first.";
  if (body.length > MESSAGE_LIMITS.body) {
    return "That message is too long to send in one go.";
  }
  return null;
}
