/**
 * Note rules (prd/phase-1.md §4.1). Plain code with no Convex imports,
 * exported through `@repo/api`.
 */

export const NOTE_LIMITS = {
  body: 5_000,
} as const;

/** Trims the ends, keeps the shape of what was written. */
export function normaliseNoteBody(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

export function noteBodyError(raw: string): string | null {
  const body = normaliseNoteBody(raw);
  if (!body) return "Write something first.";
  if (body.length > NOTE_LIMITS.body) return "That note is too long.";
  return null;
}
