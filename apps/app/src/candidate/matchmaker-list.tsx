import { cn } from "@repo/ui";
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
 * this account can talk to, and every invitation still waiting on an answer.
 *
 * A matchmaker is selected by the hash (`/c#maya.matches`) rather than a path,
 * so switching between them never remounts the shell around the thread.
 *
 * An invitation sits at the top as a card with a badge, not a row in the
 * list: it is the only way into a book (prd/phase-1.md §3.2) and it expires,
 * so it should read as something to answer rather than something to browse.
 */
export function MatchmakerList({
  className,
  matchmakers,
  invitations,
  selected,
  ownsProfile,
}: {
  className: string;
  matchmakers: JoinedMatchmaker[];
  invitations: Invitation[];
  /** The username in the hash, or `""` when nothing is open. */
  selected: string;
  /**
   * Whether this account owns a matchmaker profile. It decides which way out
   * the footer offers: back to their own book, or a first one.
   */
  ownsProfile: boolean;
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

      {/* The column's one scroller, between its heading and its footer. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        data-testid="candidate-matchmakers-scroll"
      >
        {invitations.length > 0 && (
          <section
            aria-labelledby="candidate-invitations-heading"
            data-testid="candidate-invitations"
            className="flex flex-col gap-2 border-b border-border p-3"
          >
            <h2 id="candidate-invitations-heading" className="sr-only">
              Invitations
            </h2>
            {invitations.map((invite) => (
              <Link
                key={invite.candidateId}
                to={`/invitations/${invite.candidateId}`}
                data-testid="candidate-invitation"
                className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {invite.matchmakerDisplayName}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    Invited
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  Invited you to join. Accept or decline.
                </span>
              </Link>
            ))}
          </section>
        )}

        {matchmakers.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {invitations.length > 0
              ? "You haven't joined a matchmaker yet."
              : "You haven't joined a matchmaker yet. A matchmaker brings you in by invitation."}
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
      </div>

      {/* The other side of this account, when it has one. Home resolves to
          the single workspace it owns, or to the picker when it owns more. */}
      <div className="flex shrink-0 flex-col border-t border-border p-3">
        <Link
          to={ownsProfile ? "/" : "/mm/new"}
          className="px-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          data-testid={
            ownsProfile
              ? "candidate-own-workspace"
              : "candidate-create-matchmaker"
          }
        >
          {ownsProfile ? "Your matchmaker workspace" : "Become a matchmaker"}
        </Link>
      </div>
    </section>
  );
}
