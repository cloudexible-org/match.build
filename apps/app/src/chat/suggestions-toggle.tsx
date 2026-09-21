import { api, type Id } from "@repo/api";
import { Switch } from "@repo/ui";
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
    // The label wraps the switch, which is how Base UI names it: it finds the
    // enclosing `<label>` and points the switch's `aria-labelledby` at it.
    // Two letters in a 14-row header; the whole name for a screen reader,
    // which announces on or off by itself and so wants the *setting* named,
    // not the press.
    <label
      className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground"
      title={
        enabled
          ? "Drafted replies are on for this conversation"
          : "Drafted replies are off for this conversation"
      }
    >
      <Switch
        checked={enabled}
        disabled={busy}
        data-testid="toggle-suggestions"
        data-enabled={enabled}
        onCheckedChange={(checked) => {
          setBusy(true);
          Promise.resolve(
            setEnabled({
              matchmakerId: workspace.matchmakerId,
              candidateId,
              enabled: checked,
            }),
          ).finally(() => setBusy(false));
        }}
      />
      <span className="sr-only">Drafted replies</span>
      <span aria-hidden>AI</span>
    </label>
  );
}
