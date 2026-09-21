import { api } from "@repo/api";
import { cn } from "@repo/ui";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { AppHeader } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";

/**
 * Home (prd/phase-1.md §2): everything this account can open — invitations,
 * its own matchmaker profiles, and the matchmakers it has joined.
 *
 * Only an account that owns a matchmaker profile has two sides to choose
 * between, so only it sees this. Everyone else goes straight to their own
 * chat at `/c`, which lists their matchmakers and invitations itself — a
 * candidate has nothing to pick from here.
 *
 * Creating a profile is offered on the candidate shell instead, which is
 * where an account without one now lands. An invitation opens the same
 * accept screen as its link.
 */
export function HomePage() {
  const me = useQuery(api.users.queries.me);
  const home = useQuery(api.users.queries.home);

  if (me === undefined || home === undefined) {
    return <FullPageStatus>Loading…</FullPageStatus>;
  }
  if (me === null || home === null) return null; // RequireAuth handles this
  if (home.matchmakerProfiles.length === 0) return <Navigate to="/c" replace />;

  return (
    <div className="min-h-dvh">
      <AppHeader name={me.name ?? ""} />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
        <h1 className="font-display text-3xl">
          Welcome, {me.name?.split(" ")[0]}
        </h1>

        {home.invitations.length > 0 && (
          <Section title="Invitations" testId="home-invitations">
            {home.invitations.map((invite) => (
              <RowLink
                key={invite.candidateId}
                to={`/invitations/${invite.candidateId}`}
              >
                <span>
                  <span className="font-medium">
                    {invite.matchmakerDisplayName}
                  </span>{" "}
                  invited you to join.
                </span>
                <span className="text-sm font-medium text-primary">View</span>
              </RowLink>
            ))}
          </Section>
        )}

        <Section
          title="Your matchmaker profiles"
          testId="home-matchmaker-profiles"
        >
          {home.matchmakerProfiles.map((profile) => (
            <RowLink key={profile.matchmakerId} to={`/mm/${profile.username}`}>
              <span className="font-medium">{profile.displayName}</span>
              <span className="text-sm text-muted-foreground">
                @{profile.username}
              </span>
            </RowLink>
          ))}
        </Section>

        <Section title="Your matchmakers" testId="home-candidate-profiles">
          {home.candidateProfiles.length === 0 ? (
            <Empty>You haven't joined a matchmaker yet.</Empty>
          ) : (
            home.candidateProfiles.map((profile) => (
              <RowLink
                key={profile.candidateId}
                to={`/c#${profile.matchmakerUsername}`}
              >
                <span className="font-medium">
                  {profile.matchmakerDisplayName}
                </span>
              </RowLink>
            ))
          )}
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  const headingId = `${testId}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid={testId}
      className="flex flex-col gap-3"
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2
          id={headingId}
          className="text-sm font-medium uppercase tracking-wide text-muted-foreground"
        >
          {title}
        </h2>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {children}
      </ul>
    </section>
  );
}

const rowClass = "flex items-center justify-between gap-3 px-4 py-3";

function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className={cn(
          rowClass,
          "transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        )}
      >
        {children}
      </Link>
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <li className="px-4 py-3 text-sm text-muted-foreground">{children}</li>
  );
}
