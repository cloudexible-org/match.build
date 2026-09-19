import { api } from "@repo/api";
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FullPageStatus } from "../components/full-page-status";
import { serverErrorMessage } from "../lib/server-error";

const PROBLEMS = {
  own_profile: "This invitation is from your own matchmaker profile.",
  already_member: "You're already a member of this matchmaker.",
  other_history:
    "You already have a history with this matchmaker. Ask them to re-invite you.",
} as const;

/**
 * The accept screen (prd/phase-1.md §3.2), reached two ways:
 *
 * - `/invite/:token` — the link from the email or the matchmaker. Works for
 *   any signed-in account; a signed-out visitor signs in first and returns.
 * - `/invitations/:candidateId` — from the home page, for an invite to this
 *   account's verified email.
 *
 * Shows the matchmaker's name and the privacy notice (§9.3), then Accept or
 * Decline. A used, revoked or expired invite says only that it's no longer
 * valid.
 */
export function InvitePage() {
  const { token, candidateId } = useParams();
  const ref = token !== undefined ? { token } : { candidateId };
  // Read once, on mount: an invite that expired before its scheduled job ran
  // should read as invalid rather than offering Accept (the server checks its
  // own clock when answering).
  const [now] = useState(() => Date.now());
  const preview = useQuery(api.invites.queries.preview, { ...ref, now });
  const accept = useMutation(api.invites.mutations.accept);
  const decline = useMutation(api.invites.mutations.decline);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [declinedFrom, setDeclinedFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (declinedFrom !== null) {
    return (
      <InviteCard
        title="Invitation declined"
        description={`You declined ${declinedFrom}'s invitation. They can invite you again if you change your mind.`}
      >
        <HomeLink />
      </InviteCard>
    );
  }
  // Keep the screen while an answer is in flight: the invite closes (and
  // the preview turns invalid) just before the navigation.
  if (preview === undefined && busy === null) {
    return <FullPageStatus>Loading…</FullPageStatus>;
  }
  if ((preview === undefined || preview.state === "invalid") && busy === null) {
    return (
      <InviteCard
        title="This invitation isn't valid any more"
        description="It may have been used already, withdrawn, or expired. Ask your matchmaker for a new link."
      >
        <HomeLink />
      </InviteCard>
    );
  }
  const open = preview?.state === "open" ? preview : null;
  const name = open?.matchmakerDisplayName ?? "Your matchmaker";

  async function answer(kind: "accept" | "decline") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "accept") {
        const { matchmakerUsername } = await accept(ref);
        navigate(`/c/${matchmakerUsername}`, { replace: true });
      } else {
        await decline(ref);
        setDeclinedFrom(name);
        setBusy(null);
      }
    } catch (caught) {
      setError(serverErrorMessage(caught, "Something went wrong. Try again."));
      setBusy(null);
    }
  }

  const problem = open?.problem ?? null;
  return (
    <InviteCard
      title={`${name} invited you to Matchmaker`}
      description={`Accept to continue your conversation with ${name} here.`}
    >
      <div
        className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
        data-testid="invite-privacy-notice"
      >
        {name} will keep your conversation on Matchmaker, including if you later
        leave or delete your account. What you share here is private to {name}:
        no other matchmaker can see it.
      </div>
      {problem !== null ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            {PROBLEMS[problem]}
          </p>
          <HomeLink />
        </>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              disabled={busy !== null}
              onClick={() => void answer("accept")}
            >
              {busy === "accept" ? "Accepting…" : "Accept"}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void answer("decline")}
            >
              {busy === "decline" ? "Declining…" : "Decline"}
            </Button>
          </div>
        </>
      )}
    </InviteCard>
  );
}

function InviteCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
      <Card className="w-full max-w-md" data-testid="invite-card">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </main>
  );
}

function HomeLink() {
  return (
    <Link to="/" className={buttonVariants({ variant: "outline" })}>
      Go home
    </Link>
  );
}
