import { api, type Id } from "@repo/api";
import { useMutation, useQuery } from "convex/react";
import {
  type EntryKind,
  labelFor,
  renderValue,
} from "../workspace/candidate-profile";
import {
  type Proposal,
  ProposalQuote,
  ProposedChange,
} from "../workspace/profile-proposal";
import { useWorkspace } from "../workspace/workspace-layout";
import { type SuggestionCard, SuggestionStack } from "./suggestion-stack";

/**
 * What the assistant is currently asking the matchmaker, at the bottom of a
 * conversation (prd/phase-2.md §5).
 *
 * Two of the four rows have something behind them today: the proposals open on
 * this candidate's profile, and the one open on the matchmaker's own voice. A
 * drafted reply (§4A) and a suggested match (phase 3) are rows
 * `chat/suggestions.ts` already names and nothing yet fills — when either
 * lands, it is a third `push` here and no change to the stack.
 *
 * The same proposals are also answerable in the candidate panel's Profile
 * section, which prd §5 asks for on both surfaces. Either one resolves the
 * proposal, and the other stops showing it.
 */
export function ConversationSuggestions({
  candidateId,
  onEdit,
}: {
  candidateId: Id<"candidates">;
  /** Edit on a drafted reply: hand the text to the composer. */
  onEdit?: (body: string) => void;
}) {
  const workspace = useWorkspace();
  const profile = useQuery(api.candidateProfiles.queries.get, {
    matchmakerId: workspace.matchmakerId,
    candidateId,
  });
  const mine = useQuery(api.matchmakerProfiles.queries.get, {
    matchmakerId: workspace.matchmakerId,
  });
  const resolveEntry = useMutation(
    api.candidateProfiles.mutations.resolveSuggestion,
  );
  const resolveVoice = useMutation(
    api.matchmakerProfiles.mutations.resolveVoiceSuggestion,
  );
  const drafts = useQuery(api.replySuggestions.queries.forCandidate, {
    matchmakerId: workspace.matchmakerId,
    candidateId,
  });
  const sendDraft = useMutation(api.replySuggestions.mutations.send);
  const dismissDraft = useMutation(api.replySuggestions.mutations.dismiss);

  const cards: SuggestionCard[] = [];

  for (const kind of ["facts", "notes"] as const satisfies EntryKind[]) {
    for (const [key, entry] of Object.entries(profile?.[kind] ?? {})) {
      const proposal: Proposal | undefined = entry.pending;
      if (proposal === undefined) continue;
      const answer = (accept: boolean) => () =>
        resolveEntry({
          matchmakerId: workspace.matchmakerId,
          candidateId,
          kind,
          key,
          accept,
        });
      cards.push({
        // Unique across the stack, and the same id for as long as this
        // proposal is the one open on this field.
        id: `candidateProfile:${kind}.${key}`,
        kind: "candidateProfile",
        suggestedAt: proposal.suggestedAt,
        subject: labelFor(kind, key),
        body: (
          <>
            <ProposedChange
              proposal={proposal}
              current={renderValue(kind, key, entry.value)}
              proposed={renderValue(kind, key, proposal.value)}
            />
            <ProposalQuote quote={proposal.sourceQuote} />
          </>
        ),
        actions: [
          {
            label: proposal.action === "clear" ? "Remove it" : "Accept",
            run: answer(true),
          },
        ],
        dismiss: answer(false),
      });
    }
  }

  const voice: Proposal | undefined = mine?.voice?.pending;
  if (voice !== undefined) {
    const answer = (accept: boolean) => () =>
      resolveVoice({ matchmakerId: workspace.matchmakerId, accept });
    cards.push({
      // At most one is ever open (`matchmakerProfiles.voice.pending`), so the
      // row never has arrows — but it is a row like any other.
      id: "matchmakerProfile:voice",
      kind: "matchmakerProfile",
      suggestedAt: voice.suggestedAt,
      subject: "Your voice",
      body: (
        <ProposedChange
          proposal={voice}
          current={mine?.voice?.value ?? ""}
          proposed={voice.value}
        />
      ),
      actions: [
        {
          label: voice.action === "clear" ? "Clear it" : "Use it",
          run: answer(true),
        },
      ],
      dismiss: answer(false),
    });
  }

  for (const draft of drafts ?? []) {
    cards.push({
      id: `reply:${draft._id}`,
      kind: "reply",
      suggestedAt: draft.createdAt,
      body: <p className="whitespace-pre-wrap break-words">{draft.body}</p>,
      actions: [
        {
          label: "Send",
          run: () =>
            sendDraft({
              matchmakerId: workspace.matchmakerId,
              suggestionId: draft._id,
            }),
        },
        // Edit is not an answer: the draft stays open until they send it or
        // turn it down, because a matchmaker who starts editing and changes
        // their mind should still have the original.
        ...(onEdit === undefined
          ? []
          : [
              {
                label: "Edit",
                variant: "outline" as const,
                run: () => {
                  onEdit(draft.body);
                },
                keepOpen: true,
              },
            ]),
      ],
      dismiss: () =>
        dismissDraft({
          matchmakerId: workspace.matchmakerId,
          suggestionId: draft._id,
        }),
    });
  }

  return <SuggestionStack suggestions={cards} />;
}
