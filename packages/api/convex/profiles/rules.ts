/**
 * The vocabulary both profile domains share (prd/phase-2.md §3): who is
 * allowed to write a value, how a value got where it is, and what a valid
 * value looks like.
 *
 * **This directory registers no Convex functions.** It is the kernel that
 * `convex/candidateProfiles/` and `convex/matchmakerProfiles/` are both built
 * on — a profile of a candidate and a profile of a matchmaker are different
 * records with different owners, but "an agent never overwrites what a person
 * typed" has to mean the same thing in both, and it means it here.
 *
 * Plain code with no Convex imports, exported through `@repo/api`, so the apps
 * refuse exactly what the server would.
 */

/*
 * ─── Who may write a field ──────────────────────────────────────────────────
 */

/**
 * The three ways a value gets written, as a rule about a field:
 *
 * - `matchmaker` — theirs alone. An agent may not write it and may not even
 *   propose one. Use it for a field that is the matchmaker's own judgement, or
 *   sensitive enough that a model should not be guessing at it.
 * - `agent` — the agent writes it directly, and the change shows up in the
 *   History tab like any other.
 * - `suggest` — the agent may only propose. The value does not move until a
 *   matchmaker approves it.
 *
 * A matchmaker may always write any field themselves; the policy constrains
 * the agent, not them.
 */
export type ProfileWritePolicy = "matchmaker" | "agent" | "suggest";

/**
 * How the current value got where it is. Distinct from the policy above: the
 * policy is the rule, this is the history.
 */
export type ProfileValueSource = "matchmaker" | "agent" | "agent_approved";

export const PROFILE_SOURCE_LABELS: Record<ProfileValueSource, string> = {
  matchmaker: "You added this",
  agent: "Added by the assistant",
  agent_approved: "Suggested by the assistant, approved by you",
};

/**
 * Whether an agent may write a field straight into a profile, only propose it,
 * or neither — given the field's policy and what is already there.
 *
 * **An agent never overwrites what a person typed**, whatever the policy says
 * (prd/phase-2.md §4.1B). A conversation that contradicts something entered by
 * hand is exactly the thing worth telling someone about, so it degrades to a
 * proposal rather than being dropped.
 */
export function agentWriteMode(
  policy: ProfileWritePolicy,
  existingSource: ProfileValueSource | null,
): "write" | "suggest" | "refuse" {
  if (policy === "matchmaker") return "refuse";
  if (policy === "suggest") return "suggest";
  return existingSource === "matchmaker" ? "suggest" : "write";
}

/*
 * ─── What a value looks like ────────────────────────────────────────────────
 */

export type ProfileValueKind =
  | { kind: "text"; maxLength: number }
  /** An ISO date, `YYYY-MM-DD`. */
  | { kind: "date" }
  | { kind: "integer"; min: number; max: number }
  /** Two integers, `"<min>-<max>"`, both within `min`..`max`. */
  | { kind: "range"; min: number; max: number }
  | { kind: "choice"; options: readonly string[] }
  /** A comma-separated subset of `options`, deduped, order kept. */
  | { kind: "choices"; options: readonly string[] }
  /** A comma-separated free list, e.g. languages. */
  | { kind: "list"; maxItems: number; maxLength: number };

export type ProfileFieldDef = {
  key: string;
  label: string;
  value: ProfileValueKind;
  policy: ProfileWritePolicy;
  /**
   * Whether an erasure replaces this value with the stand-in. True for
   * anything that points at *who someone is* — a birth date, where they live,
   * what they do — and for the special categories: orientation, religion,
   * politics, ethnicity. False for the rest, which say what a matchmaker was
   * working with rather than who it was, exactly as `status` and `membership`
   * survive in the audit trail (prd/phase-1.md §12).
   */
  personal: boolean;
  hint?: string;
};

export const PROFILE_LIMITS = {
  /** A free-text note's body. */
  noteBody: 5_000,
  /** A note's key, e.g. "idealWeekend". */
  noteKey: 60,
  /** How many free-text notes one profile may carry. */
  notes: 60,
  /** A verbatim quote stored beside an agent's value. */
  sourceQuote: 500,
} as const;

/*
 * ─── Validation ─────────────────────────────────────────────────────────────
 *
 * `valueError` then `normaliseValue` is the only way a value reaches the
 * database, from a person's form and from an agent alike. Everything
 * downstream — the History tab's sentences, phase 3's pre-filter — reads the
 * normalised form, so "Yes", "yes " and "yes" are one value and not three.
 */

/** Trims and normalises line endings. */
function tidy(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

function tidyToken(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function dedupe(items: string[]): string[] {
  return items.filter((item, index) => items.indexOf(item) === index);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `raw` is a real calendar date, not just four-two-two digits. */
function isRealDate(raw: string): boolean {
  if (!ISO_DATE.test(raw)) return false;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Why `raw` may not be stored for `field`, or `null` when it may.
 *
 * Empty is **not** a value: clearing a field removes the entry rather than
 * storing a blank, so there is no difference between "never recorded" and
 * "recorded as nothing".
 */
export function valueError(field: ProfileFieldDef, raw: string): string | null {
  const spec = field.value;
  const trimmed = tidy(raw);
  if (!trimmed) return `${field.label} needs a value.`;

  switch (spec.kind) {
    case "text":
      return trimmed.length > spec.maxLength
        ? `${field.label} is at most ${spec.maxLength.toLocaleString()} characters.`
        : null;

    case "date": {
      if (!isRealDate(trimmed)) {
        return `${field.label} is a date, written as YYYY-MM-DD.`;
      }
      const when = Date.parse(`${trimmed}T00:00:00Z`);
      if (when > Date.now()) return `${field.label} can't be in the future.`;
      if (trimmed < "1900-01-01") return `${field.label} looks too long ago.`;
      return null;
    }

    case "integer": {
      if (!/^-?\d+$/.test(trimmed)) return `${field.label} is a whole number.`;
      const value = Number(trimmed);
      return value < spec.min || value > spec.max
        ? `${field.label} is between ${spec.min} and ${spec.max}.`
        : null;
    }

    case "range": {
      const parts = trimmed.split("-").map((part) => part.trim());
      if (parts.length !== 2 || !parts.every((part) => /^\d+$/.test(part))) {
        return `${field.label} is two numbers with a dash — ${spec.min}-${spec.max}.`;
      }
      const [low, high] = parts.map(Number);
      if (low > high) return `${field.label} starts with the lower number.`;
      return low < spec.min || high > spec.max
        ? `${field.label} is between ${spec.min} and ${spec.max}.`
        : null;
    }

    case "choice":
      return (spec.options as readonly string[]).includes(tidyToken(trimmed))
        ? null
        : `${field.label} is one of: ${spec.options.join(", ")}.`;

    case "choices": {
      const chosen = splitList(trimmed).map(tidyToken);
      if (chosen.length === 0) return `${field.label} needs a value.`;
      const unknown = chosen.find(
        (item) => !(spec.options as readonly string[]).includes(item),
      );
      return unknown === undefined
        ? null
        : `${field.label} is any of: ${spec.options.join(", ")}.`;
    }

    case "list": {
      const items = splitList(trimmed);
      if (items.length === 0) return `${field.label} needs a value.`;
      if (items.length > spec.maxItems) {
        return `${field.label} takes at most ${spec.maxItems} entries.`;
      }
      return items.some((item) => item.length > spec.maxLength)
        ? `Each entry in ${field.label} is at most ${spec.maxLength} characters.`
        : null;
    }
  }
}

/** The stored form of `raw`. Only ever called on a value `valueError` passed. */
export function normaliseValue(field: ProfileFieldDef, raw: string): string {
  const spec = field.value;
  const trimmed = tidy(raw);
  switch (spec.kind) {
    case "text":
    case "date":
      return trimmed;
    case "integer":
      return String(Number(trimmed));
    case "range": {
      const [low, high] = trimmed.split("-").map((part) => Number(part.trim()));
      return `${low}-${high}`;
    }
    case "choice":
      return tidyToken(trimmed);
    case "choices":
      return dedupe(splitList(trimmed).map(tidyToken)).join(", ");
    case "list":
      return dedupe(
        splitList(trimmed).map((item) => item.replace(/\s+/g, " ")),
      ).join(", ");
  }
}

/** The stored value as a person reads it. */
export function displayValue(field: ProfileFieldDef, value: string): string {
  if (field.value.kind === "date") {
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toLocaleDateString(undefined, {
        timeZone: "UTC",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }
  if (field.value.kind === "range") return value.replace("-", "–");
  return value;
}

/** Age today from a stored `dateOfBirth`, or `null` if it isn't one. */
export function ageFromDateOfBirth(
  value: string,
  now: number = Date.now(),
): number | null {
  if (!isRealDate(value)) return null;
  const born = new Date(`${value}T00:00:00Z`);
  const today = new Date(now);
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - born.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && today.getUTCDate() < born.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

/*
 * ─── Free-text notes ────────────────────────────────────────────────────────
 */

const NOTE_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

/** Lower-camel, letters and digits. Keeps keys readable and comparable. */
export function noteKeyError(raw: string): string | null {
  const key = raw.trim();
  if (!key) return "A note needs a name.";
  if (key.length > PROFILE_LIMITS.noteKey) {
    return `A name is at most ${PROFILE_LIMITS.noteKey} characters.`;
  }
  if (!NOTE_KEY_PATTERN.test(key)) {
    return "A name is letters and digits, starting with a letter — like idealWeekend.";
  }
  return null;
}

export function normaliseNoteKey(raw: string): string {
  const key = raw.trim();
  return key.charAt(0).toLowerCase() + key.slice(1);
}

export function normaliseNoteBody(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

export function noteBodyError(raw: string): string | null {
  const body = normaliseNoteBody(raw);
  if (!body) return "Write something first.";
  if (body.length > PROFILE_LIMITS.noteBody) return "That note is too long.";
  return null;
}

/** "idealWeekend" → "Ideal weekend", for a key nobody has named. */
export function humaniseKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
