import { useWorkspace } from "../workspace/workspace-layout";

/**
 * The matchmaker workspace (prd/phase-1.md §4.1), mobile-first.
 *
 * With no conversation open, a narrow screen shows the candidate list and
 * nothing else; from `md` up the conversation column sits beside it. Opening
 * a conversation (`/mm/:username/c/:candidateId`, a later step) is what
 * brings the centre column forward on a phone, and adds the candidate panel
 * on the right.
 */
export function WorkspacePage() {
  const workspace = useWorkspace();
  return (
    <main className="flex min-h-0 flex-1" data-testid="workspace">
      <section
        aria-labelledby="workspace-candidates-heading"
        className="flex w-full flex-col border-border md:w-80 md:shrink-0 md:border-r"
        data-testid="workspace-candidates"
      >
        <div className="flex h-14 items-center border-b border-border px-4">
          <h1
            id="workspace-candidates-heading"
            className="font-display text-xl"
          >
            Candidates
          </h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="font-medium">No candidates yet</p>
          <p className="text-sm text-muted-foreground">
            People you onboard to {workspace.displayName} will appear here.
          </p>
        </div>
      </section>
      <section
        aria-label="Conversation"
        className="hidden flex-1 items-center justify-center bg-muted/40 p-6 text-center text-sm text-muted-foreground md:flex"
        data-testid="workspace-conversation"
      >
        Choose a candidate to open your conversation.
      </section>
    </main>
  );
}
