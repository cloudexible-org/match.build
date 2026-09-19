import { api, type Id } from "@repo/api";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useCallback } from "react";
import { useParams } from "react-router";
import { Composer } from "../chat/composer";
import { Thread } from "../chat/thread";
import { useMarkRead } from "../chat/use-mark-read";
import { AppHeader } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";
import { NotFoundPage } from "./not-found";

const PAGE_SIZE = 30;

/**
 * A candidate's chat with one matchmaker (prd/phase-1.md §4.2), at
 * `/c/:matchmakerUsername`: one thread, the matchmaker's display name above
 * it, and a composer.
 *
 * Only members get it; anyone else sees "Page not found", whether or not the
 * matchmaker exists. Only `visibility: "everyone"` messages are ever loaded —
 * the query itself can't return the matchmaker's private ones.
 *
 * Leaving arrives with step 7.
 */
export function CandidateChatPage() {
  const { matchmakerUsername = "" } = useParams();
  const me = useQuery(api.users.queries.me);
  const membership = useQuery(api.candidates.queries.self, {
    matchmakerUsername,
  });

  if (me === undefined || membership === undefined) {
    return <FullPageStatus>Loading…</FullPageStatus>;
  }
  if (me === null) return null; // RequireAuth handles this
  if (membership === null) return <NotFoundPage />;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader name={me.name ?? ""} />
      <main
        className="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col border-border md:border-x"
        data-testid="candidate-chat"
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <h1
            className="font-display text-xl"
            data-testid="candidate-chat-matchmaker"
          >
            {membership.matchmakerDisplayName}
          </h1>
        </div>
        <CandidateThread
          candidateId={membership.candidateId}
          matchmakerName={membership.matchmakerDisplayName}
        />
      </main>
    </div>
  );
}

function CandidateThread({
  candidateId,
  matchmakerName,
}: {
  candidateId: Id<"candidates">;
  matchmakerName: string;
}) {
  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.messages.queries.candidateThread,
    { candidateId },
    { initialNumItems: PAGE_SIZE },
  );
  const send = useMutation(api.messages.mutations.sendAsCandidate);
  const markReadMutation = useMutation(
    api.messages.mutations.markReadAsCandidate,
  );

  const markRead = useCallback(
    (seq: number) => markReadMutation({ candidateId, seq }),
    [markReadMutation, candidateId],
  );
  useMarkRead(results[0]?.seq, markRead);

  return (
    <>
      <Thread
        messages={[...results].reverse()}
        mine="candidate"
        emptyState={`Your conversation with ${matchmakerName} starts here.`}
        canLoadOlder={status === "CanLoadMore"}
        onLoadOlder={() => loadMore(PAGE_SIZE)}
        loadingOlder={isLoading}
      />
      <Composer
        placeholder={`Message ${matchmakerName}`}
        onSend={(body) => send({ candidateId, body })}
      />
    </>
  );
}
