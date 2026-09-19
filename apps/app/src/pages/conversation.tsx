import { api, type Id } from "@repo/api";
import { Button, buttonVariants, cn, Input } from "@repo/ui";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { candidateDisplayName, inviteUrl } from "../workspace/candidate-labels";
import { useWorkspace } from "../workspace/workspace-layout";

/**
 * One candidate's conversation in the workspace's centre column
 * (prd/phase-1.md §3.1, §4.1): who they are, their invite while it's open,
 * and the thread, private messages included and marked.
 *
 * Read-only for now: the composer and live chat arrive with step 5, and the
 * invite's Resend / Change email / Revoke with step 4.
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

  const { candidate, messages } = view;
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
          {candidate.name !== undefined && (
            <span className="truncate text-xs text-muted-foreground">
              {candidate.email}
            </span>
          )}
        </div>
      </header>

      {candidate.membership === "invited" && (
        <InviteBanner
          candidateId={candidate.candidateId}
          email={candidate.email}
          invite={candidate.invite}
        />
      )}

      <ol
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
        data-testid="conversation-messages"
      >
        {messages.length === 0 ? (
          <li className="m-auto text-sm text-muted-foreground">
            No messages yet.
          </li>
        ) : (
          messages.map((message) => (
            <li
              key={message._id}
              data-testid="conversation-message"
              className={cn(
                "flex max-w-prose flex-col gap-1 rounded-xl px-4 py-3 text-sm",
                message.visibility === "matchmaker"
                  ? "self-stretch border border-dashed border-border bg-muted/60"
                  : message.author === "matchmaker"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start bg-card border border-border",
              )}
            >
              {message.visibility === "matchmaker" && (
                <span className="text-xs font-medium text-muted-foreground">
                  {message.source === "imported"
                    ? "Imported conversation · "
                    : ""}
                  Only visible to you
                </span>
              )}
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </li>
          ))
        )}
      </ol>

      <footer className="shrink-0 border-t border-border px-4 py-3 text-sm text-muted-foreground">
        {candidate.membership === "invited"
          ? `You can message ${name} once they accept your invitation.`
          : candidate.membership === "joined"
            ? "Messaging arrives in the next update."
            : `${name} isn't a member any more. You can still read the thread.`}
      </footer>
    </div>
  );
}

function InviteBanner({
  candidateId,
  email,
  invite,
}: {
  candidateId: Id<"candidates">;
  email: string;
  invite: { expiresAt: number; copyable: boolean } | null;
}) {
  const workspace = useWorkspace();
  const token = useQuery(
    api.invites.queries.token,
    invite?.copyable
      ? { matchmakerId: workspace.matchmakerId, candidateId }
      : "skip",
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const link =
    typeof token === "string"
      ? inviteUrl(token, window.location.origin, import.meta.env.BASE_URL)
      : null;

  async function copy() {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions, insecure origin): the link is still
      // selectable in the field.
    }
  }

  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-b border-border bg-accent/40 px-4 py-3"
      data-testid="invite-banner"
    >
      <p className="text-sm">
        <span className="font-medium">Invited · not joined yet.</span>{" "}
        {invite === null
          ? "This invitation is no longer open."
          : `The invitation to ${email} expires on ${new Date(invite.expiresAt).toLocaleDateString()}.`}
      </p>
      {invite !== null &&
        (invite.copyable ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              aria-label="Invite link"
              value={link ?? ""}
              onFocus={(event) => event.target.select()}
              data-testid="invite-link"
            />
            <Button
              type="button"
              variant="outline"
              disabled={link === null}
              onClick={() => void copy()}
            >
              {copied ? "Copied" : "Copy invite link"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This invitation's link can't be copied. Re-invite to get a new one.
          </p>
        ))}
    </div>
  );
}
