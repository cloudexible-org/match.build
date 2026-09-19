/**
 * The audit trail's vocabulary (prd/phase-1.md §5): every action that can be
 * recorded, the tables an event can point at, and the field diff used to fill
 * an event's `changes`.
 *
 * Plain code with no Convex imports, so the app can import the same list to
 * label History entries.
 */

export const AUDIT_ACTIONS = [
  // The account itself. Account-level events have no matchmakerId; the
  // `account.name_changed` event is also fanned out to each matchmaker the
  // person has joined, as a separate event in that matchmaker's trail.
  "account.created",
  "account.name_changed",
  // A platform admin issued a sign-in code for the account (apps/admin).
  "account.sign_in_code_issued",

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

  // Notes.
  "note.created",
  "note.edited",
  "note.removed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TABLES = [
  "users",
  "matchmakers",
  "candidates", // includes invitations, which live on the candidate row
  "notes",
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
  notes: "Notes",
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
  notes: ["note.created", "note.edited", "note.removed"],
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
  businessName: "business name",
  name: "name",
  email: "email",
  socialHandles: "social handles",
  status: "status",
  membership: "membership",
  acceptedAs: "accepted as",
  expiresAt: "expiry",
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
  "note.created": "Added a note",
  "note.edited": "Edited a note",
  "note.removed": "Removed a note",
  "matchmaker.created": "Created the profile",
  "matchmaker.updated": "Updated the profile",
  "account.name_changed": "Changed their account name",
  "candidate.details_changed": "Updated their details",
  "candidate.status_changed": "Changed their status",
  "account.created": "Created their account",
};

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
  const label = FIELD_LABELS[change.field] ?? change.field;
  const before = decodeAuditValue(change.before);
  const after = decodeAuditValue(change.after);
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
