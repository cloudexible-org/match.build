/**
 * Validation for onboarding a candidate (prd/phase-1.md §3.1), shared by the
 * candidates mutations and the app's Onboard form. Plain code with no Convex
 * imports, exported through `@repo/api`.
 */

import { normaliseName, USER_LIMITS } from "../users/rules";
import { emailError, normaliseInstagram } from "../waitlist/rules";

export const CANDIDATE_LIMITS = {
  name: USER_LIMITS.name,
  handle: 100,
  socialHandles: 10,
  // A long DM history pasted in one go. Far below Convex's 1 MB document cap.
  importedHistory: 100_000,
  // The optional note someone leaves behind when they leave (prd §3.4). A
  // sentence or two, not an essay: it is shown in the matchmaker's History.
  leaveReason: 500,
} as const;

export const SOCIAL_PLATFORMS = [
  "instagram",
  "whatsapp",
  "tiktok",
  "facebook",
  "x",
  "linkedin",
  "other",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialHandle = { platform: SocialPlatform; handle: string };

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  linkedin: "LinkedIn",
  other: "Other",
};

/** Like the account email rule, but worded for someone else's address. */
export function candidateEmailError(raw: string): string | null {
  if (!raw.trim()) return "Enter their email address.";
  return emailError(raw);
}

/** The candidate's name is optional: blank means "use their account name". */
export function normaliseCandidateName(raw: string): string | undefined {
  return normaliseName(raw) || undefined;
}

export function candidateNameError(raw: string): string | null {
  return normaliseName(raw).length > CANDIDATE_LIMITS.name
    ? "That name is too long."
    : null;
}

// E.164: "+", a non-zero country code, at most 15 digits in all. Seven is
// the shortest real number with its country code.
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/**
 * Normalises a handle for its platform:
 *
 * - Instagram, TikTok, X: a profile URL or a leading "@" is reduced to the
 *   bare handle.
 * - WhatsApp: an E.164 phone number. Spaces, dashes, dots and brackets are
 *   dropped, as is a "(0)" trunk prefix, and a leading "00" becomes "+". The
 *   country code is required, never guessed.
 * - Facebook, LinkedIn, Other: trimmed, as typed (often a URL).
 */
export function normaliseHandle(platform: SocialPlatform, raw: string): string {
  const trimmed = raw.trim();
  switch (platform) {
    case "instagram":
      return normaliseInstagram(trimmed);
    case "tiktok":
      return stripProfileUrl(trimmed, /^(https?:\/\/)?(www\.)?tiktok\.com\//i);
    case "x":
      return stripProfileUrl(
        trimmed,
        /^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i,
      );
    case "whatsapp":
      // "(0)" is the UK-style trunk prefix written after the country code:
      // "+44 (0)7700 900123" dials +447700900123.
      return trimmed
        .replace(/\(0\)/g, "")
        .replace(/[\s\-.()]/g, "")
        .replace(/^00/, "+");
    default:
      return trimmed;
  }
}

function stripProfileUrl(raw: string, host: RegExp): string {
  return raw
    .replace(host, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
}

/** Returns an error message, or `null` when the (raw) handle is acceptable. */
export function handleError(
  platform: SocialPlatform,
  raw: string,
): string | null {
  const handle = normaliseHandle(platform, raw);
  if (!handle) return "Enter a handle, or remove this row.";
  if (platform === "whatsapp") {
    return E164_PATTERN.test(handle)
      ? null
      : "Enter the number with its country code, like +44 7700 900123.";
  }
  if (handle.length > CANDIDATE_LIMITS.handle || /\s/.test(handle)) {
    return "That doesn't look like a handle.";
  }
  return null;
}

/**
 * Normalises every handle and drops exact duplicates (same platform, same
 * normalised handle), keeping the first. Assumes each passed `handleError`.
 */
export function normaliseHandles(handles: SocialHandle[]): SocialHandle[] {
  const seen = new Set<string>();
  const result: SocialHandle[] = [];
  for (const { platform, handle } of handles) {
    const normalised = normaliseHandle(platform, handle);
    const key = `${platform}:${normalised.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ platform, handle: normalised });
  }
  return result;
}

/** The pasted history, or `undefined` when blank. Line breaks are kept. */
export function normaliseImportedHistory(raw: string): string | undefined {
  return raw.trim() || undefined;
}

export function importedHistoryError(raw: string): string | null {
  return raw.trim().length > CANDIDATE_LIMITS.importedHistory
    ? "That conversation is too long to import. Paste the most recent part."
    : null;
}

/**
 * The reason someone gives for leaving a matchmaker (prd §3.4), or
 * `undefined` when they gave none. Optional by design: nobody is made to
 * explain themselves to leave.
 */
export function normaliseLeaveReason(raw: string): string | undefined {
  return raw.trim() || undefined;
}

export function leaveReasonError(raw: string): string | null {
  return raw.trim().length > CANDIDATE_LIMITS.leaveReason
    ? "That's too long. A sentence or two is plenty."
    : null;
}
