import { api } from "@repo/api";
import { buttonVariants, cn, Input } from "@repo/ui";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Link, Outlet, useParams } from "react-router";
import {
  candidateDisplayName,
  membershipMarker,
} from "../workspace/candidate-labels";
import { useWorkspace } from "../workspace/workspace-layout";

type Status = "active" | "paused" | "archived";

const STATUSES: { value: Status; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

/**
 * The matchmaker workspace (prd/phase-1.md §4.1), mobile-first: the
 * candidate list beside the conversation, which the child route fills.
 *
 * On a phone only one column shows: the list, until a conversation is open
 * (`/mm/:username/c/:candidateId`); then the conversation, with a way back.
 * The candidate panel on the right arrives with step 6.
 */
export function WorkspacePage() {
  const workspace = useWorkspace();
  const { candidateId } = useParams();
  const open = candidateId !== undefined;
  return (
    <main className="flex min-h-0 flex-1" data-testid="workspace">
      <CandidateList
        className={cn(
          "w-full md:flex md:w-80 md:shrink-0 md:border-r",
          open ? "hidden" : "flex",
        )}
        base={`/mm/${workspace.username}`}
        openId={candidateId}
      />
      <section
        aria-label="Conversation"
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          open ? "flex" : "hidden",
        )}
        data-testid="workspace-conversation"
      >
        <Outlet context={workspace} />
      </section>
    </main>
  );
}

/** The centre column when no conversation is open. */
export function NoConversation() {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 p-6 text-center text-sm text-muted-foreground">
      Choose a candidate to open your conversation.
    </div>
  );
}

function CandidateList({
  className,
  base,
  openId,
}: {
  className: string;
  base: string;
  openId: string | undefined;
}) {
  const workspace = useWorkspace();
  const [status, setStatus] = useState<Status>("active");
  const [search, setSearch] = useState("");
  const rows = useQuery(api.candidates.queries.list, {
    matchmakerId: workspace.matchmakerId,
    status,
  });

  const needle = search.trim().toLowerCase();
  const shown =
    rows?.filter(
      (row) =>
        needle === "" ||
        row.email.includes(needle) ||
        (row.name?.toLowerCase().includes(needle) ?? false),
    ) ?? [];

  return (
    <section
      aria-labelledby="workspace-candidates-heading"
      className={cn("flex-col border-border", className)}
      data-testid="workspace-candidates"
    >
      <div className="flex h-14 items-center justify-between gap-3 border-b border-border px-4">
        <h1 id="workspace-candidates-heading" className="font-display text-xl">
          Candidates
        </h1>
        <Link
          to={`${base}/onboard`}
          className={buttonVariants({ size: "sm" })}
          data-testid="workspace-onboard"
        >
          Onboard
        </Link>
      </div>

      <div className="flex flex-col gap-2 border-b border-border p-3">
        <Input
          type="search"
          aria-label="Search candidates"
          placeholder="Search by name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <fieldset className="flex gap-1">
          <legend className="sr-only">Status</legend>
          {STATUSES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={status === option.value}
              onClick={() => setStatus(option.value)}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "flex-1",
                status === option.value && "bg-accent text-accent-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>

      {rows === undefined ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="font-medium">
            {needle !== ""
              ? "No matches"
              : status === "active"
                ? "No candidates yet"
                : `No ${status} candidates`}
          </p>
          {needle === "" && status === "active" && (
            <p className="text-sm text-muted-foreground">
              People you onboard to {workspace.displayName} will appear here.
            </p>
          )}
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {shown.map((row) => {
            const marker = membershipMarker(row.membership);
            const selected = row.candidateId === openId;
            return (
              <li key={row.candidateId}>
                <Link
                  to={`${base}/c/${row.candidateId}`}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    selected && "bg-accent",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {candidateDisplayName(row)}
                    </span>
                    {row.name !== undefined && (
                      <span className="truncate text-sm text-muted-foreground">
                        {row.email}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {marker && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {marker}
                      </span>
                    )}
                    {row.unread > 0 && (
                      <span
                        className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-medium text-primary-foreground"
                        data-testid="candidate-unread"
                      >
                        {row.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
