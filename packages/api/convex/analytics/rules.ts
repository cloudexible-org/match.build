/**
 * Which audited facts become product analytics, and what of them may leave
 * the deployment (docs/analytics-events.md §1–§3).
 *
 * The audit trail already names every change worth counting, and every one of
 * them flows through `recordAudit`. So the server half of analytics is a
 * translation from an audit event to a PostHog event, and this file is that
 * translation — pure, so it can be tested without a backend.
 *
 * The guardrail it exists to hold: an audit event's `changes` and `reason`
 * carry personal values, which is what an erasure redacts (#3). Nothing from
 * them is forwarded as-is. A property is either a fixed fact about the event
 * (what kind of actor, which agent) or a value from `changes` that is checked
 * against a closed list first — so a free-text value can never ride along,
 * even if a caller one day records one under a field this file reads.
 */

import type { AuditAction } from "../audit/rules";

/** The group type the app already files workspace events under. */
export const ANALYTICS_GROUP_TYPE = "matchmaker";

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * The audit event as the emitter sees it. Structural rather than imported
 * from the schema, so this file stays free of Convex imports.
 */
export type AnalyticsAuditEvent = {
  matchmakerId?: string;
  candidateId?: string;
  actor:
    | { type: "user"; userId: string; role: string }
    | { type: "system"; job: string }
    | { type: "agent"; agent: string; model: string };
  action: AuditAction;
  entity: { table: string; id: string };
  changes?: { field: string; before?: unknown; after?: unknown }[];
  relatedEntityId?: string;
  reason?: string;
};

export type AnalyticsProperties = Record<string, string | boolean>;

export type AnalyticsCapture = {
  event: string;
  distinctId: string;
  /**
   * An agent or a cron is not a person. PostHog is told not to make a person
   * profile for it, so it never shows up as a "user" in any count.
   */
  personless: boolean;
  properties: AnalyticsProperties;
};

/** How one audited action is forwarded. */
type Rule = {
  /** Extra properties, read from the event through the closed lists below. */
  properties?: (event: AnalyticsAuditEvent) => AnalyticsProperties;
  /**
   * Send one event per entry in `changes` rather than one for the record.
   * An agent run proposes several entries in one audit event, while a person
   * accepts or rejects them one at a time; counting both per entry is what
   * makes accepted ÷ suggested an acceptance rate.
   */
  perChange?: true;
};

const CANDIDATE_STATUSES = ["active", "paused", "archived"] as const;
const MATCH_STAGES = ["proposed", "introduced", "connected", "closed"] as const;
const MATCH_OUTCOMES = ["together", "didnt_work"] as const;
const MATCH_CLOSED_BY = [
  "matchmaker",
  "candidateA",
  "candidateB",
  "both",
  "system",
] as const;
const PROFILE_KINDS = ["facts", "notes"] as const;

/**
 * Every audit action, and whether it is forwarded. A `Record` over the whole
 * vocabulary rather than a list of the ones sent, so a new audit action does
 * not compile until someone has decided whether analytics should see it.
 *
 * `null` means not sent, and each group of them says why.
 */
const RULES: Record<AuditAction, Rule | null> = {
  "account.created": {},
  // Sent once, from the account-level record; see `isDuplicate`.
  "account.name_changed": {},
  "account.deleted": {},
  // An erasure leaving a record in PostHog, keyed to the id just erased, is
  // the open question on #3. Not sent until that is answered.
  "account.erased": null,
  // Staff actions from apps/admin, which is deliberately uninstrumented: they
  // answer no product question and would mix our clicks into the funnels.
  "account.sign_in_code_issued": null,
  "ai_agent.updated": null,
  "ai_model_rate.updated": null,

  "matchmaker.created": {},
  // Edits to a record, whose interest is in the values — which are exactly
  // what this file does not send.
  "matchmaker.updated": null,
  "candidate.details_changed": null,
  "matchmaker_profile.updated": null,

  "candidate.created": {},
  "candidate.status_changed": {
    properties: (event) => transition(event, "status", CANDIDATE_STATUSES),
  },

  "invite.created": {},
  "invite.sent": {},
  "invite.resent": {},
  "invite.email_changed": {},
  "invite.revoked": {},
  // Recorded by the expiry job. The commonest outcome of an invite, so it has
  // to be in the funnel or the acceptance rate is quietly inflated.
  "invite.expired": {},
  "invite.accepted": {},
  "invite.declined": {},

  "membership.left": {
    properties: (event) => ({ has_reason: hasText(event.reason) }),
  },
  "membership.reinvited": {},
  // Fan-outs of an account deletion and an erasure into each matchmaker's
  // trail. `account.deleted` already counts the first once; the second waits
  // on #3 with `account.erased`.
  "membership.account_deleted": null,
  "candidate.anonymised": null,

  "profile.updated": { properties: profileKind, perChange: true },
  "profile.suggested": { properties: profileKind, perChange: true },
  "profile.suggestion_accepted": { properties: profileKind, perChange: true },
  "profile.suggestion_rejected": { properties: profileKind, perChange: true },
  "matchmaker_profile.suggested": {},
  "matchmaker_profile.suggestion_accepted": {},
  "matchmaker_profile.suggestion_rejected": {},

  "match.suggested": {},
  "match.created": {},
  "match.stage_changed": {
    properties: (event) => transition(event, "stage", MATCH_STAGES),
  },
  "match.closed": {
    properties: (event) => ({
      ...pick(event, "closedAs", "outcome", MATCH_OUTCOMES),
      ...pick(event, "closedBy", "closed_by", MATCH_CLOSED_BY),
      has_note: hasText(event.reason),
    }),
  },

  // Historical: nothing records these any more.
  "note.created": null,
  "note.edited": null,
  "note.removed": null,
};

/**
 * The PostHog events for an audit event: none when it is not one to send,
 * usually one, and one per entry for the profile actions (`perChange`).
 * Every property comes from a fixed set of keys; see the file comment.
 */
export function analyticsCapturesFor(
  event: AnalyticsAuditEvent,
): AnalyticsCapture[] {
  const rule = RULES[event.action];
  if (rule === null) return [];
  if (isDuplicate(event)) return [];
  const base = captureBase(event);
  if (base === null) return [];

  const parts =
    rule.perChange === true
      ? (event.changes ?? []).map((change) => ({ ...event, changes: [change] }))
      : [event];
  return parts.map((part) => ({
    ...base,
    properties: { ...base.properties, ...rule.properties?.(part) },
  }));
}

/** Who did it, as PostHog is told; `null` for staff, who are not counted. */
function captureBase(event: AnalyticsAuditEvent): AnalyticsCapture | null {
  const { actor } = event;
  let distinctId: string;
  let personless: boolean;
  const properties: AnalyticsProperties = { actor_type: actor.type };
  if (actor.type === "user") {
    // A platform admin acting on someone's record is staff, not product use.
    if (actor.role === "platform_admin") return null;
    // The opaque account id, the same one the app passes to `identify()`, so
    // the server's events land on the same person as the browser's.
    distinctId = actor.userId;
    personless = false;
    properties.actor_role = actor.role;
  } else if (actor.type === "agent") {
    distinctId = `agent:${actor.agent}`;
    personless = true;
    properties.agent = actor.agent;
    properties.model = actor.model;
  } else {
    distinctId = `system:${actor.job}`;
    personless = true;
    properties.job = actor.job;
  }

  return { event: event.action, distinctId, personless, properties };
}

/**
 * Some facts are recorded more than once, because each trail that should show
 * them gets its own copy. Analytics counts the fact, so it keeps one.
 *
 *  - A match is recorded on both candidates' trails, each pointing at the
 *    other through `relatedEntityId`. The side whose id sorts first is kept:
 *    stateless, and exactly one of any pair.
 *  - A rename is recorded at account level and again in each matchmaker's
 *    trail. The account-level one, which has no matchmaker, is kept.
 */
function isDuplicate(event: AnalyticsAuditEvent): boolean {
  if (event.entity.table === "matches") {
    return (
      event.candidateId !== undefined &&
      event.relatedEntityId !== undefined &&
      event.candidateId > event.relatedEntityId
    );
  }
  if (event.action === "account.name_changed") {
    return event.matchmakerId !== undefined;
  }
  return false;
}

/** `from` and `to` for a field whose values are in `allowed`. */
function transition(
  event: AnalyticsAuditEvent,
  field: string,
  allowed: readonly string[],
): AnalyticsProperties {
  const change = event.changes?.find((c) => c.field === field);
  const out: AnalyticsProperties = {};
  if (change === undefined) return out;
  if (isOneOf(change.before, allowed)) out.from = change.before;
  if (isOneOf(change.after, allowed)) out.to = change.after;
  return out;
}

/** One field's new value, under `as`, when it is in `allowed`. */
function pick(
  event: AnalyticsAuditEvent,
  field: string,
  as: string,
  allowed: readonly string[],
): AnalyticsProperties {
  const after = event.changes?.find((c) => c.field === field)?.after;
  return isOneOf(after, allowed) ? { [as]: after } : {};
}

/**
 * Which half of the profile an entry is in. The entry's own key
 * (`facts.wantsKids`) is a schema name rather than a value, but the kind is
 * all §5.5 asks for, so that is all that is sent.
 */
function profileKind(event: AnalyticsAuditEvent): AnalyticsProperties {
  const field = event.changes?.[0]?.field;
  const kind = field?.split(".")[0];
  return isOneOf(kind, PROFILE_KINDS) ? { kind } : {};
}

function isOneOf(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === "string" && allowed.includes(value);
}

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

/**
 * PostHog's batch endpoint for a host, with or without a trailing slash.
 * Batch rather than single-event capture because one audit event can become
 * several PostHog events (`perChange`), and they should arrive in one request.
 */
export function batchUrl(host: string | undefined): string {
  const base =
    host === undefined || host.trim() === "" ? DEFAULT_POSTHOG_HOST : host;
  return `${base.trim().replace(/\/+$/, "")}/batch/`;
}

/** What PostHog's `/batch/` endpoint takes. */
export type PostHogBatchBody = {
  api_key: string;
  batch: {
    event: string;
    timestamp: string;
    properties: Record<string, unknown>;
  }[];
};

/**
 * The request body for a set of captures that came from one audit event.
 * `group` is the matchmaker's username — the same key the app groups its
 * workspace events under, so server and browser events land in one group.
 */
export function posthogBatch(
  apiKey: string,
  captures: AnalyticsCapture[],
  context: { group?: string; timestamp: number },
): PostHogBatchBody {
  const timestamp = new Date(context.timestamp).toISOString();
  return {
    api_key: apiKey,
    batch: captures.map((capture) => ({
      event: capture.event,
      timestamp,
      properties: {
        ...capture.properties,
        distinct_id: capture.distinctId,
        $lib: "convex",
        // PostHog geolocates an event by the IP that sent it, which here is
        // Convex's data centre, and writes the result onto the person —
        // overwriting the location their browser reported. Every server event
        // would move its person to the same point in the middle of the US.
        $geoip_disable: true,
        ...(capture.personless ? { $process_person_profile: false } : {}),
        ...(context.group === undefined
          ? {}
          : { $groups: { [ANALYTICS_GROUP_TYPE]: context.group } }),
      },
    })),
  };
}
