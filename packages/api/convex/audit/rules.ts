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
