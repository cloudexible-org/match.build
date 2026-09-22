/**
 * The audit trail's vocabulary (prd/phase-1.md §5): every action that can be
 * recorded, the tables an event can point at, and the field diff used to fill
 * an event's `changes`.
 *
 * Plain code with no Convex imports, so the app can import the same list to
 * label History entries.
 */

import {
  candidateEntryHoldsPersonalData,
  candidateProfileFieldLabel,
} from "../candidateProfiles/rules";
import {
  MATCH_CLOSED_BY_LABELS,
  MATCH_OUTCOME_LABELS,
  MATCH_STAGE_LABELS,
} from "../matches/rules";

export const AUDIT_ACTIONS = [
  // The account itself. Account-level events have no matchmakerId; the
  // `account.name_changed` event is also fanned out to each matchmaker the
  // person has joined, as a separate event in that matchmaker's trail.
  "account.created",
  "account.name_changed",
  // The person deleted their own account (prd/phase-1.md §3.5). Recorded at
  // account level; each matchmaker they had joined gets its own
  // `membership.account_deleted` event instead, so none of them learns about
  // the others.
  "account.deleted",
  // A platform admin issued a sign-in code for the account (apps/admin).
  "account.sign_in_code_issued",
  // A platform admin erased the person at their request (prd/phase-1.md §12).
  // Their identifiers are gone everywhere; the matchmakers' conversations,
  // notes and trails stay, attached to an anonymous record.
  "account.erased",

  // Matchmaker profile. Shown in profile settings, not a candidate's trail.
  "matchmaker.created",
  "matchmaker.updated",

  // Candidate details.
  "candidate.created",
  "candidate.details_changed",
  "candidate.status_changed",

  // Invitations.
  "invite.created",
  "invite.sent",
  "invite.resent",
  "invite.email_changed",
  "invite.revoked",
  "invite.expired",
  "invite.accepted",
  "invite.declined",

  // Membership.
  "membership.left",
  "membership.account_deleted",
  "membership.reinvited",
  // The candidate record this matchmaker holds was anonymised by an erasure
  // request. Recorded in their trail because their records visibly change.
  "candidate.anonymised",

  // An AI agent's model or standing instruction, changed by a platform admin
  // (prd/phase-2.md §4.4). Platform-level: no matchmakerId, so it appears in
  // the admin trail and in nobody's candidate history — but it changes how the
  // product behaves for every tenant, which is exactly why it is recorded.
  "ai_agent.updated",

  // What a model costs, changed by a platform admin (`aiUsage/rules.ts`).
  // Platform-level like the one above, and recorded for the same reason: the
  // gateway reports tokens and no price, so every figure on the usage page is
  // arithmetic over a number somebody typed, and the trail is where that
  // number's history lives.
  "ai_model_rate.updated",

  // The candidate's profile (prd/phase-2.md §3). One vocabulary covers every
  // field: which entry moved is `changes[].field`, written as
  // `facts.wantsKids` or `notes.idealWeekend`.
  "profile.updated",
  "profile.suggested", // an agent proposed a value; nothing has moved yet
  "profile.suggestion_accepted",
  "profile.suggestion_rejected",

  // The matchmaker's own profile — their voice. No candidateId; it appears in
  // their profile history, not in anyone's book.
  "matchmaker_profile.updated",
  "matchmaker_profile.suggested",
  "matchmaker_profile.suggestion_accepted",
  "matchmaker_profile.suggestion_rejected",

  // The match board (prd/phase-3.md §2). Every stage change is recorded on
  // **both** candidates' trails, as two events: a matchmaker reading one
  // person's history should see what was tried for them without having to know
  // who else was on the card.
  "match.suggested", // the nightly run found a pair
  "match.created", // the matchmaker paired two people by hand
  "match.stage_changed",
  // A match ended, well or badly. One action for both, because they are one
  // event; `changes` carries which, and who ended it.
  "match.closed",

  // Historical: the `notes` table these replaced (prd/phase-2.md §3), which
  // no longer exists. The trail is append-only, so events recorded before the
  // change still have to render. Nothing writes these any more.
  "note.created",
  "note.edited",
  "note.removed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TABLES = [
  "users",
  "matchmakers",
  "candidates", // includes invitations, which live on the candidate row
  "candidateProfiles",
  "matchmakerProfiles",
  "aiAgentSettings",
  "aiModelRates",
  "matches",
  "notes", // historical; the table is gone, its events are not
] as const;

export type AuditEntityTable = (typeof AUDIT_ENTITY_TABLES)[number];

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

/** One changed field, before JSON encoding. */
export type FieldChange = {
  field: string;
  before?: unknown;
  after?: unknown;
};

/**
 * The fields among `fields` whose values differ between `before` and `after`,
 * compared structurally (so two equal arrays of social handles are unchanged).
 * Returns an empty array when nothing changed — callers skip the audit event
 * rather than record a no-op.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const from = before[field];
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field, before: from, after: to });
    }
  }
  return changes;
}

/*
 * ─── Reading the trail ──────────────────────────────────────────────────────
 *
 * The History tab's filters and sentences (prd/phase-1.md §5.2). Plain code,
 * so the app renders exactly what the server recorded.
 */

export const AUDIT_FILTERS = {
  all: "All",
  details: "Details",
  membership: "Invitations & membership",
  profile: "Profile",
  matches: "Matches",
} as const;

export type AuditFilter = keyof typeof AUDIT_FILTERS;

const FILTER_ACTIONS: Record<Exclude<AuditFilter, "all">, AuditAction[]> = {
  details: [
    "candidate.created",
    "candidate.details_changed",
    "candidate.status_changed",
    "account.name_changed",
  ],
  membership: [
    "candidate.anonymised",
    "invite.created",
    "invite.sent",
    "invite.resent",
    "invite.email_changed",
    "invite.revoked",
    "invite.expired",
    "invite.accepted",
    "invite.declined",
    "membership.left",
    "membership.account_deleted",
    "membership.reinvited",
  ],
  profile: [
    "profile.updated",
    "profile.suggested",
    "profile.suggestion_accepted",
    "profile.suggestion_rejected",
    // The notes the profile replaced still belong under this filter.
    "note.created",
    "note.edited",
    "note.removed",
  ],
  matches: [
    "match.suggested",
    "match.created",
    "match.stage_changed",
    "match.closed",
  ],
};

/** Whether an event belongs under a filter. `all` keeps everything. */
export function matchesAuditFilter(
  action: string,
  filter: AuditFilter,
): boolean {
  if (filter === "all") return true;
  return (FILTER_ACTIONS[filter] as string[]).includes(action);
}

const FIELD_LABELS: Record<string, string> = {
  username: "username",
  displayName: "display name",
  name: "name",
  email: "email",
  socialHandles: "social handles",
  status: "status",
  membership: "membership",
  acceptedAs: "accepted as",
  stage: "stage",
  score: "score",
  closedAs: "outcome",
  closedBy: "ended by",
  closingNote: "what happened",
  expiresAt: "expiry",
  voice: "voice",
  inputUsdPerMillion: "input rate ($/M tokens)",
  outputUsdPerMillion: "output rate ($/M tokens)",
  cachedInputUsdPerMillion: "cached input rate ($/M tokens)",
};

/** Sentences for the events that speak for themselves, without a diff. */
const PLAIN_SENTENCES: Partial<Record<AuditAction, string>> = {
  "candidate.created": "Onboarded them",
  "invite.created": "Created an invitation",
  "invite.sent": "Emailed the invitation",
  "invite.resent": "Emailed the invitation again",
  "invite.revoked": "Revoked the invitation",
  "invite.expired": "The invitation expired",
  "invite.accepted": "Accepted the invitation",
  "invite.declined": "Declined the invitation",
  "invite.email_changed": "Changed the invited email",
  "membership.left": "Left",
  "membership.account_deleted": "Deleted their account",
  "membership.reinvited": "Re-invited them",
  "profile.updated": "Updated their profile",
  "profile.suggested": "The assistant suggested a change to their profile",
  "profile.suggestion_accepted": "Accepted a suggestion",
  "profile.suggestion_rejected": "Dismissed a suggestion",
  "matchmaker_profile.updated": "Updated your profile",
  "matchmaker_profile.suggested":
    "The assistant suggested a change to your profile",
  "matchmaker_profile.suggestion_accepted": "Accepted a suggestion",
  "matchmaker_profile.suggestion_rejected": "Dismissed a suggestion",
  "note.created": "Added a note",
  "note.edited": "Edited a note",
  "note.removed": "Removed a note",
  "matchmaker.created": "Created the profile",
  "matchmaker.updated": "Updated the profile",
  "account.name_changed": "Changed their account name",
  "candidate.details_changed": "Updated their details",
  "candidate.status_changed": "Changed their status",
  "account.created": "Created their account",
  "account.deleted": "Deleted their account",
  "account.erased": "Erased their personal data at their request",
  "candidate.anonymised":
    "Anonymised them at their request — the conversation, notes and history are unchanged",
  "ai_agent.updated": "Changed an AI agent's settings",
  "ai_model_rate.updated": "Changed what a model costs",
  "match.suggested": "The nightly run suggested a match",
  "match.created": "Paired them with someone by hand",
  "match.stage_changed": "Moved a match",
  "match.closed": "Closed a match",
};

/*
 * A stage stored as `mutual_interest` is a database value, not a sentence. The
 * trail renders the label the board uses, so one vocabulary covers both.
 */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  stage: MATCH_STAGE_LABELS,
  closedAs: MATCH_OUTCOME_LABELS,
  closedBy: MATCH_CLOSED_BY_LABELS,
};

/*
 * ─── Erasure ────────────────────────────────────────────────────────────────
 *
 * A trail that records "changed email from jane@gmial.com to jane@gmail.com"
 * is itself a copy of the person (prd/phase-1.md §12). Erasing them has to
 * reach it, but §5.3 promises the trail is append-only — so an erasure
 * redacts the *values* inside an event and never touches the event itself.
 * What happened, when, and who did it all survive; only the person does not.
 */

/** The stand-in an erased value is replaced with, before JSON encoding. */
export const ERASED_VALUE = "[erased]";

/**
 * The `changes` fields that hold a person's own details rather than a
 * matchmaker's workflow. `status`, `membership` and `expiresAt` say nothing
 * about who someone is, so they stay readable after an erasure; a username or
 * display name belongs to the matchmaker, not the candidate.
 */
const PERSONAL_FIELDS = new Set([
  "name",
  "email",
  "socialHandles",
  "acceptedAs",
]);

export function fieldHoldsPersonalData(field: string): boolean {
  return PERSONAL_FIELDS.has(field) || candidateEntryHoldsPersonalData(field);
}

/** One recorded change, as stored: JSON-encoded values. */
export type AuditChange = {
  field: string;
  before?: string;
  after?: string;
};

/**
 * The readable lines for one event: a headline, then one line per changed
 * field with its before and after. Unknown actions fall back to their name
 * rather than disappearing.
 */
export function describeAuditEvent(
  action: string,
  changes: AuditChange[],
): string[] {
  const headline =
    PLAIN_SENTENCES[action as AuditAction] ?? action.replace(/[._]/g, " ");
  const details = changes.map(describeChange);
  // "Added a note" plus its text reads better than the headline alone.
  return details.length === 0 ? [headline] : [headline, ...details];
}

function describeChange(change: AuditChange): string {
  const label =
    FIELD_LABELS[change.field] ??
    candidateProfileFieldLabel(change.field) ??
    change.field;
  const values = VALUE_LABELS[change.field];
  const labelled = (raw: string | undefined) =>
    raw === undefined ? undefined : (values?.[raw] ?? raw);
  const before = labelled(decodeAuditValue(change.before));
  const after = labelled(decodeAuditValue(change.after));
  if (before === undefined && after !== undefined) {
    return `${sentenceCase(label)}: ${after}`;
  }
  if (before !== undefined && after === undefined) {
    return `${sentenceCase(label)} removed (was ${before})`;
  }
  return `${sentenceCase(label)}: ${before ?? "—"} → ${after ?? "—"}`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Renders a stored (JSON-encoded) audit value for display. */
export function decodeAuditValue(
  encoded: string | undefined,
): string | undefined {
  if (encoded === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    return encoded;
  }
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.length === 0
      ? "none"
      : value
          .map((item) =>
            typeof item === "object" && item !== null && "platform" in item
              ? `${(item as { platform: string }).platform}: ${(item as { handle: string }).handle}`
              : String(item),
          )
          .join(", ");
  }
  if (typeof value === "number" && value > 1_000_000_000_000) {
    return new Date(value).toLocaleDateString();
  }
  return String(value);
}
