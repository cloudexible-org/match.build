import { AUDIT_ACTIONS, AUDIT_PAGE_SIZE, api, type Id } from "@repo/api";
import { Button, Field, FieldLabel, NativeSelect } from "@repo/ui";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { AccountSearch } from "../components/account-search";
import { ErrorBoundary } from "../components/error-boundary";
import {
  type AuditFilterState,
  changeAuditFilter,
  hasAuditFilters,
  readAuditFilters,
  writeAuditFilters,
} from "../lib/audit-filters";
import {
  ACTION_LABELS,
  actionLabel,
  actorText,
  changeText,
} from "../lib/audit-labels";

/**
 * Every tenant's audit trail, newest first, filtered by matchmaker (and one of
 * its candidates) or by the account that acted, and by action. The filters
 * live in the URL.
 */
export function AuditTrailPage() {
  const [params, setParams] = useSearchParams();
  const filters = readAuditFilters(params);
  const update = (change: Partial<AuditFilterState>) =>
    setParams(writeAuditFilters(changeAuditFilter(filters, change)));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">Audit trail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every recorded change across all matchmakers, newest first.
        </p>
      </div>
      <Filters
        filters={filters}
        onChange={update}
        onClear={() => setParams({})}
      />
      <ErrorBoundary
        key={params.toString()}
        fallback={
          <p className="text-sm text-destructive" role="alert">
            Couldn't load the audit trail with these filters.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => setParams({})}
            >
              Clear filters
            </button>
          </p>
        }
      >
        <Events filters={filters} onChange={update} />
      </ErrorBoundary>
    </div>
  );
}

function Filters({
  filters,
  onChange,
  onClear,
}: {
  filters: AuditFilterState;
  onChange: (change: Partial<AuditFilterState>) => void;
  onClear: () => void;
}) {
  const matchmakers = useQuery(api.admin.queries.matchmakers);
  const candidates = useQuery(
    api.admin.queries.candidates,
    filters.matchmakerId
      ? { matchmakerId: filters.matchmakerId as Id<"matchmakers"> }
      : "skip",
  );

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      aria-label="Filters"
      data-testid="audit-filters"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <FieldLabel>Matchmaker</FieldLabel>
          <NativeSelect
            value={filters.matchmakerId ?? ""}
            onChange={(event) => onChange({ matchmakerId: event.target.value })}
          >
            <option value="">All matchmakers</option>
            {matchmakers?.map((matchmaker) => (
              <option key={matchmaker._id} value={matchmaker._id}>
                {matchmaker.displayName} (@{matchmaker.username})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field disabled={!filters.matchmakerId}>
          <FieldLabel>Candidate</FieldLabel>
          <NativeSelect
            value={filters.candidateId ?? ""}
            onChange={(event) => onChange({ candidateId: event.target.value })}
            disabled={!filters.matchmakerId}
          >
            <option value="">
              {filters.matchmakerId
                ? "All candidates"
                : "Choose a matchmaker first"}
            </option>
            {candidates?.map((candidate) => (
              <option key={candidate._id} value={candidate._id}>
                {candidate.label === candidate.email
                  ? candidate.email
                  : `${candidate.label} (${candidate.email})`}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel>Action</FieldLabel>
          <NativeSelect
            value={filters.action ?? ""}
            onChange={(event) => onChange({ action: event.target.value })}
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {filters.actorUserId ? (
        <AccountFilter
          userId={filters.actorUserId}
          onClear={() => onChange({ actorUserId: undefined })}
        />
      ) : (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium">
            Filter by the account that acted
          </summary>
          <div className="mt-3">
            <AccountSearch
              label="Account"
              testId="audit-account-search"
              renderAction={(account) => (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onChange({ actorUserId: account._id })}
                >
                  Filter
                </Button>
              )}
            />
          </div>
        </details>
      )}

      {hasAuditFilters(filters) && (
        <Button
          variant="link"
          className="h-auto self-start px-0"
          onClick={onClear}
        >
          Clear all filters
        </Button>
      )}
    </section>
  );
}

function AccountFilter({
  userId,
  onClear,
}: {
  userId: string;
  onClear: () => void;
}) {
  const account = useQuery(api.admin.queries.account, {
    userId: userId as Id<"users">,
  });
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      data-testid="audit-account-filter"
    >
      <span className="text-muted-foreground">Done by</span>
      <span className="rounded-md bg-muted px-2 py-1 font-medium">
        {account === undefined
          ? "…"
          : (account?.email ?? account?.name ?? "Unknown account")}
      </span>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Remove
      </Button>
    </div>
  );
}

function Events({
  filters,
  onChange,
}: {
  filters: AuditFilterState;
  onChange: (change: Partial<AuditFilterState>) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.queries.auditTrail,
    {
      matchmakerId: filters.matchmakerId as Id<"matchmakers"> | undefined,
      candidateId: filters.candidateId as Id<"candidates"> | undefined,
      actorUserId: filters.actorUserId as Id<"users"> | undefined,
      action: filters.action,
    },
    { initialNumItems: AUDIT_PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="audit-empty">
          No events match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">By</th>
                <th className="px-3 py-2 font-medium">Matchmaker</th>
                <th className="px-3 py-2 font-medium">Candidate</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody
              className="divide-y divide-border"
              data-testid="audit-events"
            >
              {results.map((event) => {
                const { actor, matchmaker, candidate } = event;
                return (
                  <tr
                    key={event._id}
                    className="align-top"
                    data-testid="audit-event"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      <time
                        dateTime={new Date(event._creationTime).toISOString()}
                      >
                        {new Date(event._creationTime).toLocaleString()}
                      </time>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {actionLabel(event.action)}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {event.action}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {actor.type === "user" ? (
                        <FilterLink
                          onClick={() =>
                            onChange({ actorUserId: actor.userId })
                          }
                          title="Show only what this account did"
                        >
                          {actorText(actor, event.actorLabel)}
                        </FilterLink>
                      ) : (
                        actorText(actor, null)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {matchmaker ? (
                        <FilterLink
                          onClick={() =>
                            onChange({ matchmakerId: matchmaker._id })
                          }
                          title="Show only this matchmaker"
                        >
                          @{matchmaker.username}
                        </FilterLink>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {candidate && matchmaker ? (
                        <FilterLink
                          onClick={() =>
                            onChange({
                              matchmakerId: matchmaker._id,
                              candidateId: candidate._id,
                            })
                          }
                          title="Show only this candidate"
                        >
                          {candidate.label}
                        </FilterLink>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {event.accountLabel && (
                          <li>Account: {event.accountLabel}</li>
                        )}
                        {event.changes.map((change) => (
                          <li key={change.field} className="break-words">
                            {changeText(change)}
                          </li>
                        ))}
                        {event.reason && <li>Reason: {event.reason}</li>}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {status !== "Exhausted" && (
        <Button
          variant="outline"
          className="self-center"
          disabled={status !== "CanLoadMore"}
          onClick={() => loadMore(AUDIT_PAGE_SIZE)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

function FilterLink({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-left text-foreground underline-offset-4 hover:text-primary hover:underline"
    >
      {children}
    </button>
  );
}
