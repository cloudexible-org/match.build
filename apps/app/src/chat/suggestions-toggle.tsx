import { type AiFunction, api, type Id } from "@repo/api";
import { Popover, PopoverTitle, Switch } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useWorkspace } from "../workspace/workspace-layout";

/**
 * The matchmaker's AI controls for *this* conversation (prd/phase-2.md §4A),
 * in the conversation header: an "AI" button that opens a panel of one switch
 * per function.
 *
 * **Why a panel and not one switch.** There are three agents on a conversation
 * and they do quite different things — one writes drafts nobody sends without
 * reading, one keeps a record of the candidate, one learns how the matchmaker
 * writes. A single switch made them one decision, so somebody who wanted
 * drafts but not a profile written about their candidate had to give up both.
 *
 * Three states per switch, and the difference matters:
 *
 * - **on** — the function runs here;
 * - **off** — it does not. Turning drafts or the profile off retires what is
 *   open and forgets that agent's thread, so switching back on starts from
 *   nothing rather than resuming a conversation it half-remembers;
 * - **not available** — no agent is configured for it on this deployment, so
 *   that switch is disabled and says so. A control that does nothing is worse
 *   than no control: it invites somebody to press it twice and wonder.
 *
 * The whole button is hidden when nothing at all could run.
 */

type FunctionState = { on: boolean; available: boolean };

/** What each switch is called, and the one line under it. */
const COPY: Record<AiFunction, { label: string; does: string }> = {
  drafts: {
    label: "Draft replies",
    does: "Suggests what you could say next, in your voice.",
  },
  profile: {
    label: "Keep their profile",
    does: "Notices what they tell you and files it, with their own words.",
  },
  voice: {
    label: "Learn how I write",
    does: "Uses what you type here as a sample of your voice.",
  },
};

const ORDER: AiFunction[] = ["drafts", "profile", "voice"];

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
  const setFunction = useMutation(api.replySuggestions.mutations.setAiFunction);
  const [busy, setBusy] = useState<AiFunction | null>(null);

  // Nothing while it loads, and nothing where no agent would run: the header
  // is 14 rows tall on a phone and a control that cannot work has not earned
  // a place in it.
  if (state === undefined || !state.available) return null;

  const states: Record<AiFunction, FunctionState> = {
    drafts: state.drafts,
    profile: state.profile,
    voice: state.voice,
  };
  const onCount = ORDER.filter((fn) => states[fn].on).length;

  function set(fn: AiFunction, enabled: boolean) {
    setBusy(fn);
    Promise.resolve(
      setFunction({
        matchmakerId: workspace.matchmakerId,
        candidateId,
        fn,
        enabled,
      }),
    ).finally(() => setBusy(null));
  }

  return (
    <Popover
      className="w-72 p-1"
      trigger={
        <button
          type="button"
          // Two letters in a 14-row header; the whole state for a screen
          // reader, which cannot see the dot.
          aria-label={`AI on this conversation — ${onCount} of ${ORDER.length} on`}
          title={`AI: ${onCount} of ${ORDER.length} on`}
          data-testid="toggle-suggestions"
          data-on-count={onCount}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden>AI</span>
          {/*
           * Filled when everything is on, hollow when nothing is, half when
           * it is mixed — so the header says which of the three states this
           * conversation is in without being opened. Colour alone would not:
           * the ring is there in every state and the fill is what changes.
           */}
          <span
            aria-hidden
            data-testid="ai-indicator"
            className={
              onCount === ORDER.length
                ? "size-2 rounded-full bg-primary ring-1 ring-primary"
                : onCount === 0
                  ? "size-2 rounded-full ring-1 ring-muted-foreground/60"
                  : "size-2 rounded-full bg-gradient-to-r from-primary from-50% to-transparent to-50% ring-1 ring-primary"
            }
          />
        </button>
      }
    >
      <PopoverTitle className="px-3 pt-2.5 pb-1.5 text-muted-foreground">
        AI on this conversation
      </PopoverTitle>
      <div className="flex flex-col">
        {ORDER.map((fn) => {
          const { on, available } = states[fn];
          // Drafting and noticing are one generation, so a profile cannot be
          // kept up to date with drafts off. Said here rather than silently
          // disabling a switch somebody would otherwise press twice.
          const blockedByDrafts =
            fn === "profile" && available && !states.drafts.on;
          const disabled = !available || blockedByDrafts || busy !== null;
          return (
            <label
              key={fn}
              data-testid={`ai-switch-${fn}`}
              data-on={on}
              data-disabled={disabled}
              className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 hover:bg-accent has-[:disabled]:cursor-default has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-transparent"
            >
              <Switch
                checked={on}
                disabled={disabled}
                onCheckedChange={(checked) => set(fn, checked)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {COPY[fn].label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {!available
                    ? "No agent is set up for this on this deployment."
                    : blockedByDrafts
                      ? "Needs drafted replies on — it reads what they say in the same pass."
                      : COPY[fn].does}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </Popover>
  );
}
