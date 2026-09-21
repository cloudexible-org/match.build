import { api, type Id } from "@repo/api";
import { Button, cn } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useWorkspace } from "../workspace/workspace-layout";

/**
 * The matchmaker's switch for drafted replies in *this* conversation
 * (prd/phase-2.md §4A), in the conversation header.
 *
 * Three states, and the difference matters:
 *
 * - **on** — drafts arrive a few seconds after the candidate writes;
 * - **off** — they do not, here. Everything open is retired the moment it is
 *   switched, and switching back on starts the agent from nothing rather than
 *   resuming a conversation it half-remembers;
 * - **not available** — no agent is configured on this deployment at all, so
 *   the switch is hidden. A control that does nothing is worse than no
 *   control: it invites somebody to press it twice and wonder.
 */
export function SuggestionsToggle({
  candidateId,
}: {
  candidateId: Id<"candidates">;
}) {
  const workspace = useWorkspace();
  const state = useQuery(api.replySuggestions.queries.enabledFor, {
    matchmakerId: workspace.matchmakerId,
    candidateId,
  });
  const setEnabled = useMutation(api.replySuggestions.mutations.setEnabled);
  const [busy, setBusy] = useState(false);

  // Nothing while it loads, and nothing where no agent would run: the header
  // is 14 rows tall on a phone and a control that cannot work has not earned
  // a place in it.
  if (state === undefined || !state.available) return null;

  const { enabled } = state;
  return (
    <Button
      variant="ghost"
      size="sm"
      role="switch"
      aria-checked={enabled}
      disabled={busy}
      data-testid="toggle-suggestions"
      data-enabled={enabled}
      title={
        enabled
          ? "Drafted replies are on for this conversation"
          : "Drafted replies are off for this conversation"
      }
      onClick={() => {
        setBusy(true);
        Promise.resolve(
          setEnabled({
            matchmakerId: workspace.matchmakerId,
            candidateId,
            enabled: !enabled,
          }),
        ).finally(() => setBusy(false));
      }}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          enabled ? "bg-primary" : "bg-muted-foreground/40",
        )}
      />
      {/* Named in full for a screen reader; shortened for a phone's header. */}
      <span className="sr-only">
        {enabled ? "Turn off drafted replies" : "Turn on drafted replies"}
      </span>
      <span aria-hidden className="hidden sm:inline">
        Suggestions
      </span>
    </Button>
  );
}
