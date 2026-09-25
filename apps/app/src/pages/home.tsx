import { api } from "@repo/api";
import { cn } from "@repo/ui";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { FullPageStatus } from "../components/full-page-status";
import { CardList, Page, PageHeader, PageSection } from "../shell/page";

/**
 * Home (prd/phase-1.md §2): the picker, for an account that has something to
 * pick between.
 *
 * It renders for two kinds of account:
 *
 * - one with **nothing yet** — no matchmaker profile, no matchmaker joined,
 *   no invitation — which is every account the moment it signs up. It is
 *   asked which side it is on, so a matchmaker isn't left hunting for the
 *   "Become a matchmaker" link at the foot of the candidate shell.
 * - one that owns **more than one** matchmaker profile.
 *
 * Anything else has an obvious destination and goes straight there:
 *
 * - no profile, but a matchmaker or an invitation → `/c`, their own chat,
 *   which lists both itself.
 * - one profile → that workspace.
 *
 * The UI allows one profile per account (prd/phase-1.md §1), so today
 * nobody reaches the multi-profile picker. It stays because the limit is a
 * UI rule rather than a schema one, and an account that somehow owns two must
 * be able to open both.
 */
export function HomePage() {
  const me = useQuery(api.users.queries.me);
  const home = useQuery(api.users.queries.home);

  if (me === undefined || home === undefined) {
    return <FullPageStatus>Loading…</FullPageStatus>;
  }
  if (me === null || home === null) return null; // RequireAuth handles this

  const profiles = home.matchmakerProfiles;
  if (profiles.length === 0) {
    const isNew =
      home.candidateProfiles.length === 0 && home.invitations.length === 0;
    if (!isNew) return <Navigate to="/c" replace />;
    return <ChooseSide name={me.name ?? ""} />;
  }
  if (profiles.length === 1) {
    return <Navigate to={`/mm/${profiles[0].username}`} replace />;
  }

  return (
    <Page accountName={me.name ?? ""}>
      <PageHeader
        title={`Welcome, ${me.name?.split(" ")[0] ?? ""}`}
        description="Open your own book, or a conversation with one of your matchmakers."
      />

      {home.invitations.length > 0 && (
        <PageSection title="Invitations" testId="home-invitations">
          <CardList>
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
          </CardList>
        </PageSection>
      )}

      <PageSection
        title="Your matchmaker profiles"
        testId="home-matchmaker-profiles"
      >
        <CardList>
          {profiles.map((profile) => (
            <RowLink key={profile.matchmakerId} to={`/mm/${profile.username}`}>
              <span className="font-medium">{profile.displayName}</span>
              <span className="text-sm text-muted-foreground">
                @{profile.username}
              </span>
            </RowLink>
          ))}
        </CardList>
      </PageSection>

      <PageSection title="Your matchmakers" testId="home-candidate-profiles">
        <CardList>
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
        </CardList>
      </PageSection>
    </Page>
  );
}

/**
 * The first thing a new account sees: which side of match.build it is on.
 *
 * Neither choice is final. Someone who picks "looking for a match" can still
 * become a matchmaker from the candidate shell, and this page keeps coming
 * back until the account has a profile, a matchmaker or an invitation.
 */
function ChooseSide({ name }: { name: string }) {
  return (
    <Page accountName={name}>
      <PageHeader
        title={`Welcome, ${name.split(" ")[0]}`}
        description="How will you use match.build?"
      />
      <div className="grid gap-4 sm:grid-cols-2" data-testid="home-choose-side">
        <ChoiceLink
          to="/mm/new"
          title="I'm a matchmaker"
          testId="home-choose-matchmaker"
        >
          Set up your workspace to bring candidates in and run your
          conversations with them.
        </ChoiceLink>
        <ChoiceLink
          to="/c"
          title="I'm looking for a match"
          testId="home-choose-candidate"
        >
          Your matchmaker invites you in, and your conversation with them lives
          here.
        </ChoiceLink>
      </div>
    </Page>
  );
}

function ChoiceLink({
  to,
  title,
  testId,
  children,
}: {
  to: string;
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-accent focus-visible:border-primary focus-visible:bg-accent focus-visible:outline-none"
    >
      <span className="font-display text-xl">{title}</span>
      <span className="text-sm text-muted-foreground">{children}</span>
    </Link>
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
