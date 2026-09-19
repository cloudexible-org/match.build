/**
 * Where to go after signing in. Only same-app paths are honoured, so a crafted
 * `?next=https://evil.example` (or protocol-relative `//evil.example`) can't
 * turn the sign-in page into an open redirect.
 */
export function safeNextPath(next: string | null): string {
  if (!next?.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/** The sign-in page, returning to `from` afterwards (unless that's home). */
export function signInPath(from: string): string {
  const next = safeNextPath(from);
  return next === "/"
    ? "/sign-in"
    : `/sign-in?next=${encodeURIComponent(next)}`;
}
