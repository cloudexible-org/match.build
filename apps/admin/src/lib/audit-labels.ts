import type { AuditAction } from "@repo/api";

/**
 * Readable text for audit events in the admin app's trail. `before` / `after`
 * arrive JSON-encoded, as stored.
 */

export const ACTION_LABELS: Record<AuditAction, string> = {
  "account.created": "Account created",
  "account.name_changed": "Account name changed",
  "account.deleted": "Account deleted",
  "account.sign_in_code_issued": "Sign-in code issued by admin",
  "account.erased": "Personal data erased on request",
  "ai_agent.updated": "AI agent settings changed",
  "matchmaker.created": "Matchmaker profile created",
  "matchmaker.updated": "Matchmaker profile updated",
  "candidate.created": "Candidate onboarded",
  "candidate.details_changed": "Candidate details changed",
  "candidate.status_changed": "Candidate status changed",
  "invite.created": "Invite created",
  "invite.sent": "Invite sent",
  "invite.resent": "Invite resent",
  "invite.email_changed": "Invite email changed",
  "invite.revoked": "Invite revoked",
  "invite.expired": "Invite expired",
  "invite.accepted": "Invite accepted",
  "invite.declined": "Invite declined",
  "membership.left": "Candidate left",
  "membership.account_deleted": "Candidate deleted their account",
  "membership.reinvited": "Candidate re-invited",
  "candidate.anonymised": "Candidate anonymised on request",
  "profile.updated": "Candidate profile changed",
  "profile.suggested": "Candidate profile change suggested",
  "profile.suggestion_accepted": "Suggestion accepted",
  "profile.suggestion_rejected": "Suggestion dismissed",
  "matchmaker_profile.updated": "Matchmaker profile changed",
  "matchmaker_profile.suggested": "Matchmaker profile change suggested",
  "matchmaker_profile.suggestion_accepted": "Suggestion accepted",
  "matchmaker_profile.suggestion_rejected": "Suggestion dismissed",
  // Historical: the notes table `candidateProfiles` replaced. The trail is
  // append-only, so events recorded before the change still have to read.
  "note.created": "Note added",
  "note.edited": "Note edited",
  "note.removed": "Note removed",
};

export function actionLabel(action: string): string {
  return action in ACTION_LABELS
    ? ACTION_LABELS[action as AuditAction]
    : action;
}

export type AuditActorView =
  | { type: "user"; role: string }
  | { type: "system"; job: string }
  | { type: "agent"; agent: string; model: string };

const ROLE_LABELS: Record<string, string> = {
  account: "account",
  matchmaker: "matchmaker",
  candidate: "candidate",
  platform_admin: "platform admin",
};

/**
 * "Jane (matchmaker)", "System: invite_expiry", or
 * "Assistant: candidate_profile (openai/gpt-5.6-luna)" — the model included
 * because "the assistant changed this" is only half an answer once the model
 * behind an agent has moved on.
 */
export function actorText(actor: AuditActorView, label: string | null): string {
  if (actor.type === "system") return `System: ${actor.job}`;
  if (actor.type === "agent") {
    return `Assistant: ${actor.agent} (${actor.model})`;
  }
  const role = ROLE_LABELS[actor.role] ?? actor.role;
  return `${label ?? "Unknown account"} (${role})`;
}

export type FieldChangeView = {
  field: string;
  before?: string;
  after?: string;
};

/** `name: "Jane" → "Jane Smith"`, with absent values shown as "—". */
export function changeText(change: FieldChangeView): string {
  return `${change.field}: ${show(change.before)} → ${show(change.after)}`;
}

function show(encoded: string | undefined): string {
  if (encoded === undefined) return "—";
  try {
    const value: unknown = JSON.parse(encoded);
    return typeof value === "string" ? `“${value}”` : encoded;
  } catch {
    return encoded;
  }
}
