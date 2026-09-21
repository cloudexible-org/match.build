import { api, type Id } from "@repo/api";
import { buttonVariants } from "@repo/ui";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { Composer } from "../chat/composer";
import { ConversationSuggestions } from "../chat/conversation-suggestions";
import { Thread as MessageThread } from "../chat/thread";
import { useMarkRead } from "../chat/use-mark-read";
import { PushNudge } from "../notifications/push-nudge";
import { ConversationPanes } from "../shell/conversation-panes";
import {
  candidateDisplayName,
  type Membership,
} from "../workspace/candidate-labels";
import {
  CandidatePanel,
  type PanelCandidate,
} from "../workspace/candidate-panel";
import { MembershipBanner } from "../workspace/membership-banner";
import { useWorkspace } from "../workspace/workspace-layout";

/** Messages loaded at a time; "Load older messages" fetches another page. */
const PAGE_SIZE = 30;

/**
 * One candidate's conversation in the workspace (prd/phase-1.md §3.3, §4.1):
 * the thread in the centre and the candidate panel on the right.
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
  return <Conversation candidate={view.candidate} base={base} />;
}

/** The thread beside the candidate panel; `ConversationPanes` owns both. */
function Conversation({
  candidate,
  base,
}: {
  candidate: PanelCandidate & { name?: string };
  base: string;
}) {
  const name = candidateDisplayName(candidate);
  const showsEmail =
    candidate.name !== undefined || candidate.acceptedAs !== undefined;
  return (
    <ConversationPanes
      testId="conversation"
      back={{ to: base, label: "Back to candidates" }}
      title={name}
      titleTestId="conversation-candidate-name"
      subtitle={
        showsEmail && (
          <span
            className="truncate text-xs text-muted-foreground"
            data-testid="conversation-candidate-email"
          >
            {candidate.acceptedAs !== undefined
              ? `Invited as ${candidate.email} · Accepted as ${candidate.acceptedAs}`
              : candidate.email}
          </span>
        )
      }
      panelLabel={`About ${name}`}
      panelToggleTestId="toggle-candidate-panel"
      panel={(close) => (
        <CandidatePanel candidate={candidate} onClose={close} />
      )}
    >
      <MembershipBanner
        candidateId={candidate.candidateId}
        name={name}
        email={candidate.email}
        membership={candidate.membership}
        membershipChangedAt={candidate.membershipChangedAt}
        invite={candidate.invite}
      />

      {/* Keyed by candidate: opening another starts its paging fresh. */}
      <Thread
        key={candidate.candidateId}
        candidateId={candidate.candidateId}
        name={name}
        membership={candidate.membership}
        membershipChangedAt={candidate.membershipChangedAt}
      />
    </ConversationPanes>
  );
}

const day = (time: number) => new Date(time).toLocaleDateString();

/** The thread and composer for one candidate. */
function Thread({
  candidateId,
  name,
  membership,
  membershipChangedAt,
}: {
  candidateId: Id<"candidates">;
  name: string;
  membership: Membership;
  membershipChangedAt: number;
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

  const markRead = useCallback(
    (seq: number) => markReadMutation({ ...args, seq }),
    [markReadMutation, args.matchmakerId, args.candidateId],
  );
  useMarkRead(results[0]?.seq, markRead);
  // Push is offered after the first message they send, not on load (prd §8.2).
  const [justSent, setJustSent] = useState(false);
  // Edit on a drafted reply puts its text in the composer. The token counts
  // presses, so editing the same draft twice fills the box again.
  const [draft, setDraft] = useState<{ token: number; body: string } | null>(
    null,
  );

  // Where the composer would be, so the reason is at the end of the timeline
  // as well as in the banner above it (prd/phase-1.md §3.4).
  const closed = {
    invited: `You can message ${name} once they accept your invitation.`,
    declined: `You can message ${name} if they accept a new invitation.`,
    joined: undefined,
    left: `${name} left on ${day(membershipChangedAt)}. You can still read the thread, and your notes are yours to keep.`,
    account_deleted: `${name} deleted their account on ${day(membershipChangedAt)}. You can still read the thread, and your notes are yours to keep.`,
  }[membership];

  return (
    <>
      <MessageThread
        // The query pages newest-first; a thread reads oldest-first.
        messages={[...results].reverse()}
        mine="matchmaker"
        emptyState={`Nothing here yet. Say hello to ${name}.`}
        canLoadOlder={status === "CanLoadMore"}
        onLoadOlder={() => loadMore(PAGE_SIZE)}
        loadingOlder={isLoading}
      />
      {justSent && closed === undefined && <PushNudge />}
      {/* Above the composer, and above the reason the composer is closed: a
          proposal about someone who left is still worth answering. */}
      <ConversationSuggestions
        candidateId={candidateId}
        onEdit={(body) =>
          setDraft((current) => ({ token: (current?.token ?? 0) + 1, body }))
        }
      />
      <Composer
        placeholder={`Message ${name}`}
        disabledReason={closed}
        draft={draft}
        onSend={async (body) => {
          await send({ ...args, body });
          setJustSent(true);
        }}
      />
    </>
  );
}
