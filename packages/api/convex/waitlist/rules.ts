/**
 * Validation rules for a waitlist sign-up, shared by the `waitlist.join`
 * mutation and the marketing site's form so both enforce identical bounds.
 *
 * Deliberately plain code with no Convex imports: `apps/www` imports it through
 * `@repo/api` into a browser bundle.
 */

export const WAITLIST_LIMITS = {
  email: 254, // RFC 5321 maximum path length
  name: 100,
  instagram: 30, // Instagram's own username limit
  source: 32,
} as const;

// Deliberately loose: one "@", something either side, a dot in the domain.
// Deliverability is proven by the confirmation email later, not by a regex.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INSTAGRAM_PATTERN = /^[a-z0-9._]+$/i;

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Accepts "@handle", "handle" or a profile URL; returns the bare handle. */
export function normaliseInstagram(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
}

/** Returns an error message, or `null` when the (raw) email is acceptable. */
export function emailError(raw: string): string | null {
  const email = normaliseEmail(raw);
  if (!email) return "Enter your email address.";
  if (email.length > WAITLIST_LIMITS.email || !EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function nameError(raw: string): string | null {
  return raw.trim().length > WAITLIST_LIMITS.name
    ? "That name is too long."
    : null;
}

export function instagramError(raw: string): string | null {
  const handle = normaliseInstagram(raw);
  if (!handle) return null;
  return handle.length > WAITLIST_LIMITS.instagram ||
    !INSTAGRAM_PATTERN.test(handle)
    ? "That doesn't look like an Instagram handle."
    : null;
}
