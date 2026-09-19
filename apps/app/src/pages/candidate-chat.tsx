import { api } from "@repo/api";
import { useQuery } from "convex/react";
import { useParams } from "react-router";
import { AppHeader } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";
import { NotFoundPage } from "./not-found";

/**
 * A candidate's chat with one matchmaker (prd/phase-1.md §4.2), at
 * `/c/:matchmakerUsername`. Only members get it; anyone else sees "Page not
 * found", whether or not the matchmaker exists.
 *
 * For now the shell a new member lands on after accepting: the messages and
 * composer arrive with step 5, and Leave with step 7.
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
    <div className="flex min-h-dvh flex-col">
      <AppHeader name={me.name ?? ""} />
      <main
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col"
        data-testid="candidate-chat"
      >
        <div className="flex h-14 items-center border-b border-border px-4">
          <h1
            className="font-display text-xl"
            data-testid="candidate-chat-matchmaker"
          >
            {membership.matchmakerDisplayName}
          </h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="font-medium">
            You've joined {membership.matchmakerDisplayName}
          </p>
          <p className="text-sm text-muted-foreground">
            Your conversation with them will appear here.
          </p>
        </div>
      </main>
    </div>
  );
}
