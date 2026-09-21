/**
 * Rules for the platform admin app (apps/admin). Plain code with no Convex
 * imports, so the admin app can import the same limits through `@repo/api`.
 */

import { normaliseEmail } from "../waitlist/rules";

/**
 * The platform admins' addresses from the `PLATFORM_ADMIN_EMAILS` deployment
 * env var: comma-separated, normalised like every stored email. Unset or
 * blank means nobody is an admin.
 */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map(normaliseEmail)
    .filter((email) => email.length > 0);
}

export function isAdminEmail(
  email: string | undefined,
  raw: string | undefined,
): boolean {
  if (email === undefined) return false;
  return parseAdminEmails(raw).includes(normaliseEmail(email));
}

/** Audit trail page size, and the most one request may ask for. */
export const AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 100;

/** How many accounts an email search returns. */
export const ACCOUNT_SEARCH_LIMIT = 20;

/** The shortest query an account search runs, so it can't list everyone. */
export const ACCOUNT_SEARCH_MIN_LENGTH = 2;

/**
 * The key range of every normalised email starting with `prefix`, for an
 * index range scan: `[prefix, prefix + U+FFFF)`.
 */
export function emailPrefixRange(prefix: string): {
  start: string;
  end: string;
} {
  const start = normaliseEmail(prefix);
  return { start, end: `${start}\uffff` };
}

/**
 * The audit trail's filters. Generic over the id types so this file stays free
 * of Convex imports; the server instantiates it with `Id<…>`.
 */
export type AuditFilters<M = string, C = string, U = string> = {
  matchmakerId?: M;
  candidateId?: C;
  actorUserId?: U;
  action?: string;
};

/**
 * Why a filter combination can't be served, or `null`. A matchmaker or
 * candidate narrows by tenant and an account by who acted; there is an index
 * for each of those with or without an action, but not for both at once.
 */
export function auditFiltersError(
  filters: AuditFilters<unknown, unknown, unknown>,
): string | null {
  const bySubject =
    filters.matchmakerId !== undefined || filters.candidateId !== undefined;
  if (bySubject && filters.actorUserId !== undefined) {
    return "Filter by a matchmaker or candidate, or by an account — not both.";
  }
  return null;
}

/*
 * ─── Erasure (prd/phase-1.md §12) ───────────────────────────────────────────
 */

/**
 * Ceilings for one erasure. It runs in a single transaction, so exceeding one
 * rolls the whole thing back and nothing is half-erased: an erasure that
 * quietly stopped part-way is worse than one that refused and said so.
 *
 * Phase-1 volumes are nowhere near these — a candidate's trail runs to tens of
 * events — so hitting one means something needs designing, not raising.
 */
export const ERASURE_LIMITS = {
  memberships: 100,
  auditEvents: 1000,
  outboxEmails: 500,
} as const;

/** What an admin must type to confirm an erasure: the account's own address. */
export function erasureConfirmationError(
  typed: string,
  email: string | undefined,
): string | null {
  if (email === undefined) return "This account has no address to confirm.";
  return typed.trim().toLowerCase() === email.toLowerCase()
    ? null
    : "Type the account's email address exactly to confirm.";
}
