import {
  AUDIT_FILTERS,
  type AuditFilter,
  api,
  describeAuditEvent,
  type Id,
} from "@repo/api";
import { Button, cn } from "@repo/ui";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { useWorkspace } from "./workspace-layout";

const PAGE_SIZE = 25;

const when = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const FILTERS = Object.entries(AUDIT_FILTERS) as [AuditFilter, string][];

/**
 * The History tab (prd/phase-1.md §5.2): who changed what, when, newest
 * first, with the filters the spec lists. The sentences come from
 * `audit/rules.ts`, so what is shown is what was recorded.
 */
export function CandidateHistory({
  candidateId,
}: {
  candidateId: Id<"candidates">;
}) {
  const [filter, setFilter] = useState<AuditFilter>("all");
  return (
    <div className="flex flex-col gap-3" data-testid="candidate-history">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent",
              filter === value && "bg-accent text-accent-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Keyed by filter: switching starts its paging from the first page. */}
      <Events key={filter} candidateId={candidateId} filter={filter} />
    </div>
  );
}

function Events({
  candidateId,
  filter,
}: {
  candidateId: Id<"candidates">;
  filter: AuditFilter;
}) {
  const workspace = useWorkspace();
  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.audit.queries.candidateHistory,
    { matchmakerId: workspace.matchmakerId, candidateId, filter },
    { initialNumItems: PAGE_SIZE },
  );

  if (results.length === 0 && status !== "CanLoadMore" && !isLoading) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>;
  }
  return (
    <>
      <ol className="flex flex-col divide-y divide-border">
        {results.map((event) => (
          <li
            key={event._id}
            className="flex flex-col gap-0.5 py-3"
            data-testid="history-entry"
          >
            {describeAuditEvent(event.action, event.changes).map((line) => (
              <span key={line} className="text-sm">
                {line}
              </span>
            ))}
            {event.reason !== undefined && (
              <span className="text-sm text-muted-foreground">
                Reason: {event.reason}
              </span>
            )}
            <time
              dateTime={new Date(event._creationTime).toISOString()}
              className="text-xs text-muted-foreground"
            >
              {actorLabel(event.actor)} · {when.format(event._creationTime)}
            </time>
          </li>
        ))}
      </ol>
      {status === "CanLoadMore" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          disabled={isLoading}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {isLoading ? "Loading…" : "Load older"}
        </Button>
      )}
    </>
  );
}

/** "You" for the matchmaker's own doing, their name for the candidate's. */
function actorLabel(actor: { kind: string; name: string }): string {
  if (actor.kind === "matchmaker") return "You";
  if (actor.kind === "system") return "System";
  if (actor.kind === "platform_admin") return `Platform admin (${actor.name})`;
  return actor.name;
}
