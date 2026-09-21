import { api, type Id } from "@repo/api";
import { Button, buttonVariants, cn } from "@repo/ui";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import {
  type Invitation,
  type JoinedMatchmaker,
  MatchmakerList,
} from "../candidate/matchmaker-list";
import {
  MatchmakerPanel,
  type SelectedMatchmaker,
} from "../candidate/matchmaker-panel";
import { Composer } from "../chat/composer";
import { Thread } from "../chat/thread";
import { useMarkRead } from "../chat/use-mark-read";
import { AppHeader } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";
import { useMediaQuery } from "../lib/use-media-query";
import { PushNudge } from "../notifications/push-nudge";

const PAGE_SIZE = 30;

/** The matchmaker the `#maya.matches` hash names, or `""`. */
function selectedUsername(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    // A malformed escape in a hand-edited URL: read it literally rather than
    // throwing on render. No such matchmaker, so the shell says so.
    return hash.replace(/^#/, "");
  }
}

/**
 * The candidate shell (prd/phase-1.md §4.2), at `/c`: the matchmakers this
 * account belongs to, the conversation with the one the hash names, and what
 * that membership lets them do.
 *
 * The same three columns as a matchmaker's workspace, from the other side.
 * The hash rather than a path segment keeps the shell mounted while the
 * candidate moves between matchmakers, so the list never flickers.
 *
 * An account lands here straight from `/` unless it owns a matchmaker
 * profile — including an account with no matchmakers at all, who gets the
 * empty state and a way to find one.
 */
export function CandidatePage() {
  const me = useQuery(api.users.queries.me);
  const home = useQuery(api.users.queries.home);

  if (me === undefined || home === undefined) {
    return <FullPageStatus>Loading…</FullPageStatus>;
  }
  if (me === null || home === null) return null; // RequireAuth handles this

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader name={me.name ?? ""} wide />
      <Shell
        matchmakers={home.candidateProfiles}
        invitations={home.invitations}
        canCreateProfile={home.matchmakerProfiles.length === 0}
      />
    </div>
  );
}

/** The three columns, once we know what this account has. */
function Shell({
  matchmakers,
  invitations,
  canCreateProfile,
}: {
  matchmakers: JoinedMatchmaker[];
  invitations: Invitation[];
  canCreateProfile: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const selected = selectedUsername(location.hash);
  const first = matchmakers[0]?.matchmakerUsername;
  // Tailwind's `md`, where the list and the conversation sit side by side.
  const twoColumns = useMediaQuery("(min-width: 768px)");

  // Landing on `/c` opens the first matchmaker, so a candidate arrives in
  // the conversation rather than at a chooser. Not on a phone, where that
  // would cover the list and leave "Back to matchmakers" with nowhere to go.
  // Replace, so Back still leaves the app rather than bouncing between `/c`
  // and `/c#…`.
  useEffect(() => {
    if (twoColumns && selected === "" && first !== undefined) {
      void navigate(`/c#${first}`, { replace: true });
    }
  }, [twoColumns, selected, first, navigate]);

  const open = selected !== "";
  return (
    <main className="flex min-h-0 flex-1" data-testid="candidate-shell">
      <MatchmakerList
        className={cn(
          "w-full md:flex md:w-80 md:shrink-0 md:border-r",
          open ? "hidden" : "flex",
        )}
        matchmakers={matchmakers}
        invitations={invitations}
        selected={selected}
        canCreateProfile={canCreateProfile}
      />
      <section
        aria-label="Conversation"
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          open ? "flex" : "hidden",
        )}
        data-testid="candidate-conversation"
      >
        {open ? (
          // Keyed by matchmaker: opening another starts its paging fresh.
          <Conversation key={selected} matchmakerUsername={selected} />
        ) : matchmakers.length > 0 ? (
          // A phone that hasn't picked yet, where this column is hidden
          // behind the list — and the one frame before the effect above
          // opens the first matchmaker anywhere else.
          <ChooseMatchmaker />
        ) : (
          <NoMatchmaker hasInvitations={invitations.length > 0} />
        )}
      </section>
    </main>
  );
}

/** The centre column while a matchmaker is still to be picked. */
function ChooseMatchmaker() {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 p-6 text-center text-sm text-muted-foreground">
      Choose a matchmaker to open your conversation.
    </div>
  );
}

/** The centre column when this account has no matchmaker to open. */
function NoMatchmaker({ hasInvitations }: { hasInvitations: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6 text-center">
      <p className="font-medium">No conversations yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasInvitations
          ? "Accept an invitation to start talking to your matchmaker."
          : "Once you join a matchmaker, your conversation with them lives here."}
      </p>
      <Link
        to="/c/mm/discover"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Join another matchmaker
      </Link>
    </div>
  );
}

/** The thread with one matchmaker, beside the panel about them. */
function Conversation({ matchmakerUsername }: { matchmakerUsername: string }) {
  const membership = useQuery(api.candidates.queries.self, {
    matchmakerUsername,
  });
  const [panelOpen, setPanelOpen] = useState(false);

  if (membership === undefined) {
    return (
      <p className="p-4 text-sm text-muted-foreground" aria-live="polite">
        Loading…
      </p>
    );
  }
  // Never joined, left, or no such matchmaker — the same answer to all three,
  // so a stranger learns nothing about who exists (prd §9.2).
  if (membership === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h2 className="font-display text-2xl">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          That link doesn't lead anywhere.
        </p>
      </div>
    );
  }

  const name = membership.matchmakerDisplayName;
  // `min-w-0`: without it this flex row can grow past a phone's viewport and
  // the whole page scrolls sideways.
  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-testid="candidate-chat">
      <div
        className={cn(
          "min-w-0 flex-1 flex-col",
          panelOpen ? "hidden lg:flex" : "flex",
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <Link
            to="/c"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "md:hidden",
            )}
            aria-label="Back to matchmakers"
          >
            ←
          </Link>
          <h1
            className="min-w-0 flex-1 truncate font-display text-xl"
            data-testid="candidate-chat-matchmaker"
          >
            {name}
          </h1>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={panelOpen}
            data-testid="toggle-matchmaker-panel"
            onClick={() => setPanelOpen((panel) => !panel)}
          >
            Details
          </Button>
        </header>
        <CandidateThread
          candidateId={membership.candidateId}
          matchmakerName={name}
        />
      </div>

      <aside
        aria-label={`About ${name}`}
        className={cn(
          "min-w-0 flex-1 border-border lg:flex lg:max-w-sm lg:border-l",
          panelOpen ? "flex" : "hidden",
        )}
      >
        <MatchmakerPanel
          matchmaker={membership satisfies SelectedMatchmaker}
          onClose={() => setPanelOpen(false)}
        />
      </aside>
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
  // Push is offered after the first message they send, not on load (prd §8.2).
  const [justSent, setJustSent] = useState(false);

  return (
    <>
      <Thread
        // The query pages newest-first; a thread reads oldest-first.
        messages={[...results].reverse()}
        mine="candidate"
        emptyState={`Your conversation with ${matchmakerName} starts here.`}
        canLoadOlder={status === "CanLoadMore"}
        onLoadOlder={() => loadMore(PAGE_SIZE)}
        loadingOlder={isLoading}
      />
      {justSent && <PushNudge />}
      <Composer
        placeholder={`Message ${matchmakerName}`}
        onSend={async (body) => {
          await send({ candidateId, body });
          setJustSent(true);
        }}
      />
    </>
  );
}

/**
 * The old per-matchmaker path (`/c/maya.matches`), kept so links already sent
 * — notification emails, bookmarks — still land on the right conversation.
 */
export function CandidateChatRedirect() {
  const { matchmakerUsername = "" } = useParams();
  return <Navigate to={`/c#${matchmakerUsername}`} replace />;
}
