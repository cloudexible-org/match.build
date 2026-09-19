import { api, type Id } from "@repo/api";
import { buttonVariants, cn } from "@repo/ui";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useCallback } from "react";
import { Link, useParams } from "react-router";
import { Composer } from "../chat/composer";
import { Thread } from "../chat/thread";
import { useMarkRead } from "../chat/use-mark-read";
import {
  candidateDisplayName,
  type Membership,
} from "../workspace/candidate-labels";
import { MembershipBanner } from "../workspace/membership-banner";
import { useWorkspace } from "../workspace/workspace-layout";

/** Messages loaded at a time; "Load older messages" fetches another page. */
const PAGE_SIZE = 30;

/**
 * One candidate's conversation in the workspace's centre column
 * (prd/phase-1.md §3.3, §4.1): who they are, their invite while it's open,
 * the thread including the matchmaker's private messages, and the composer —
 * which only opens while they're a member.
 */
export function ConversationPage() {
  const workspace = useWorkspace();
  const { candidateId = "" } = useParams();
  const view = useQuery(api.candidates.queries.conversation, {
    matchmakerId: workspace.matchmakerId,
    candidateId,
  });
  const base = `/mm/${workspace.username}`;

  if (view === undefined) {
    return (
      <p className="p-4 text-sm text-muted-foreground" aria-live="polite">
        Loading…
      </p>
    );
  }
  if (view === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">Conversation not found</p>
        <Link to={base} className={buttonVariants({ variant: "outline" })}>
          Back to candidates
        </Link>
      </div>
    );
  }

  const { candidate } = view;
  const name = candidateDisplayName(candidate);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="conversation">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link
          to={base}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "md:hidden",
          )}
          aria-label="Back to candidates"
        >
          ←
        </Link>
        <div className="flex min-w-0 flex-col">
          <h2
            className="truncate font-medium"
            data-testid="conversation-candidate-name"
          >
            {name}
          </h2>
          {(candidate.name !== undefined ||
            candidate.acceptedAs !== undefined) && (
            <span
              className="truncate text-xs text-muted-foreground"
              data-testid="conversation-candidate-email"
            >
              {candidate.acceptedAs !== undefined
                ? `Invited as ${candidate.email} · Accepted as ${candidate.acceptedAs}`
                : candidate.email}
            </span>
          )}
        </div>
      </header>

      <MembershipBanner
        candidateId={candidate.candidateId}
        name={name}
        email={candidate.email}
        membership={candidate.membership}
        membershipChangedAt={candidate.membershipChangedAt}
        invite={candidate.invite}
      />

      {/* Keyed by candidate: opening another one starts its paging fresh. */}
      <Conversation
        key={candidate.candidateId}
        candidateId={candidate.candidateId}
        name={name}
        membership={candidate.membership}
      />
    </div>
  );
}

function Conversation({
  candidateId,
  name,
  membership,
}: {
  candidateId: Id<"candidates">;
  name: string;
  membership: Membership;
}) {
  const workspace = useWorkspace();
  const args = { matchmakerId: workspace.matchmakerId, candidateId };
  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.messages.queries.thread,
    args,
    { initialNumItems: PAGE_SIZE },
  );
  const send = useMutation(api.messages.mutations.send);
  const markReadMutation = useMutation(api.messages.mutations.markRead);

  // The query pages newest-first; a thread reads oldest-first.
  const messages = [...results].reverse();
  const markRead = useCallback(
    (seq: number) => markReadMutation({ ...args, seq }),
    [markReadMutation, args.matchmakerId, args.candidateId],
  );
  useMarkRead(results[0]?.seq, markRead);

  const closed = {
    invited: `You can message ${name} once they accept your invitation.`,
    declined: `You can message ${name} if they accept a new invitation.`,
    joined: undefined,
    left: `${name} isn't a member any more. You can still read the thread.`,
    account_deleted: `${name} deleted their account. You can still read the thread.`,
  }[membership];

  return (
    <>
      <Thread
        messages={messages}
        mine="matchmaker"
        emptyState={`Nothing here yet. Say hello to ${name}.`}
        canLoadOlder={status === "CanLoadMore"}
        onLoadOlder={() => loadMore(PAGE_SIZE)}
        loadingOlder={isLoading}
      />
      <Composer
        placeholder={`Message ${name}`}
        disabledReason={closed}
        onSend={(body) => send({ ...args, body })}
      />
    </>
  );
}
