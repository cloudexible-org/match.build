/**
 * The audit trail's filters, kept in the URL so a filtered view can be
 * bookmarked or shared with another admin. Ids stay strings here; the page
 * hands them to Convex, which validates them.
 */

export type AuditFilterState = {
  matchmakerId?: string;
  candidateId?: string;
  actorUserId?: string;
  action?: string;
};

const PARAMS = {
  matchmakerId: "matchmaker",
  candidateId: "candidate",
  actorUserId: "account",
  action: "action",
} as const satisfies Record<keyof AuditFilterState, string>;

export function readAuditFilters(params: URLSearchParams): AuditFilterState {
  const state: AuditFilterState = {};
  for (const [key, param] of Object.entries(PARAMS) as [
    keyof AuditFilterState,
    string,
  ][]) {
    const value = params.get(param)?.trim();
    if (value) state[key] = value;
  }
  return state;
}

export function writeAuditFilters(state: AuditFilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(PARAMS) as [
    keyof AuditFilterState,
    string,
  ][]) {
    const value = state[key];
    if (value) params.set(param, value);
  }
  return params;
}

/**
 * Applies one filter change, keeping the combination one the server serves: a
 * candidate belongs to the chosen matchmaker, and a matchmaker or candidate
 * excludes an account (and the other way round). The action combines with
 * anything.
 */
export function changeAuditFilter(
  state: AuditFilterState,
  change: Partial<AuditFilterState>,
): AuditFilterState {
  const next = { ...state, ...change };
  if ("matchmakerId" in change && change.matchmakerId !== state.matchmakerId) {
    delete next.candidateId;
  }
  if (change.matchmakerId || change.candidateId) delete next.actorUserId;
  if (change.actorUserId) {
    delete next.matchmakerId;
    delete next.candidateId;
  }
  for (const key of Object.keys(next) as (keyof AuditFilterState)[]) {
    if (!next[key]) delete next[key];
  }
  return next;
}

export function hasAuditFilters(state: AuditFilterState): boolean {
  return Object.keys(state).length > 0;
}
