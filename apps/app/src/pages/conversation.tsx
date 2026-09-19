import { api } from "@repo/api";
import { buttonVariants, cn } from "@repo/ui";
import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { candidateDisplayName } from "../workspace/candidate-labels";
import { MembershipBanner } from "../workspace/membership-banner";
import { useWorkspace } from "../workspace/workspace-layout";

/**
 * One candidate's conversation in the workspace's centre column
 * (prd/phase-1.md §3.1, §4.1): who they are, their invite while it's open,
 * and the thread, private messages included and marked.
 *
 * Read-only for now: the composer and live chat arrive with step 5.
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
          {(candidate.name !== undefined ||
            candidate.acceptedAs !== undefined) && (
            <span
              className="truncate text-xs text-muted-foreground"
              data-testid="conversation-candidate-email"
            >
              {candidate.acceptedAs !== undefined
                ? `Invited as ${candidate.email} · Accepted as ${candidate.acceptedAs}`
                : candidate.email}
            </span>
          )}
        </div>
      </header>

      <MembershipBanner
        candidateId={candidate.candidateId}
        name={name}
        email={candidate.email}
        membership={candidate.membership}
        membershipChangedAt={candidate.membershipChangedAt}
        invite={candidate.invite}
      />

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
        {
          {
            invited: `You can message ${name} once they accept your invitation.`,
            declined: `You can message ${name} if they accept a new invitation.`,
            joined: "Messaging arrives in the next update.",
            left: `${name} isn't a member any more. You can still read the thread.`,
            account_deleted: `${name} isn't a member any more. You can still read the thread.`,
          }[candidate.membership]
        }
      </footer>
    </div>
  );
}
