import { buttonVariants, cn } from "@repo/ui";
import { Link } from "react-router";

export type JoinedMatchmaker = {
  candidateId: string;
  matchmakerUsername: string;
  matchmakerDisplayName: string;
};

export type Invitation = {
  candidateId: string;
  matchmakerDisplayName: string;
};

/**
 * The candidate shell's first column (prd/phase-1.md §4.2): every matchmaker
 * this account can talk to, and everything still waiting on an answer.
 *
 * A matchmaker is selected by the hash (`/c#maya.matches`) rather than a path,
 * so switching between them never remounts the shell around the thread.
 *
 * Pending applications from Discover belong in `Waiting` alongside the
 * invitations once phase 3 creates them (prd/phase-3.md §3); the section is
 * built to take them.
 */
export function MatchmakerList({
  className,
  matchmakers,
  invitations,
  selected,
  canCreateProfile,
}: {
  className: string;
  matchmakers: JoinedMatchmaker[];
  invitations: Invitation[];
  /** The username in the hash, or `""` when nothing is open. */
  selected: string;
  /** Accounts without a matchmaker profile of their own are offered one. */
  canCreateProfile: boolean;
}) {
  return (
    <section
      aria-labelledby="candidate-matchmakers-heading"
      className={cn("flex-col border-border", className)}
      data-testid="candidate-matchmakers"
    >
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <h1 id="candidate-matchmakers-heading" className="font-display text-xl">
          Matchmakers
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {matchmakers.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            You haven't joined a matchmaker yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {matchmakers.map((row) => {
              const open = row.matchmakerUsername === selected;
              return (
                <li key={row.candidateId}>
                  <Link
                    to={`/c#${row.matchmakerUsername}`}
                    aria-current={open ? "page" : undefined}
                    className={cn(
                      "flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      open && "bg-accent",
                    )}
                  >
                    <span className="truncate font-medium">
                      {row.matchmakerDisplayName}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      @{row.matchmakerUsername}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {invitations.length > 0 && (
          <section
            aria-labelledby="candidate-waiting-heading"
            data-testid="candidate-waiting"
            className="border-t border-border"
          >
            <h2
              id="candidate-waiting-heading"
              className="px-4 pb-2 pt-4 text-sm font-medium uppercase tracking-wide text-muted-foreground"
            >
              Waiting on you
            </h2>
            <ul className="divide-y divide-border border-t border-border">
              {invitations.map((invite) => (
                <li key={invite.candidateId}>
                  <Link
                    to={`/invitations/${invite.candidateId}`}
                    className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span className="truncate font-medium">
                      {invite.matchmakerDisplayName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Invited you to join
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
        <Link
          to="/c/mm/discover"
          className={buttonVariants({ variant: "outline", size: "sm" })}
          data-testid="candidate-join-another"
        >
          Join another matchmaker
        </Link>
        {canCreateProfile && (
          <Link
            to="/mm/new"
            className="px-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            data-testid="candidate-create-matchmaker"
          >
            Become a matchmaker
          </Link>
        )}
      </div>
    </section>
  );
}
