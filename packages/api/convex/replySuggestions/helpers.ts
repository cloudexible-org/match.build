/**
 * Gathering what the drafting agent is told, and reading its drafts
 * (prd/phase-2.md §4A). Plain functions taking a `ctx`; nothing here is
 * registered as a function.
 *
 * The shaping of it into prose is `rules.ts`, which has no Convex imports and
 * is where a reader can see exactly what leaves this deployment. This file is
 * only the reads that feed it.
 */

import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import { candidateProfileFor } from "../candidateProfiles/helpers";
import {
  candidateField,
  candidateNoteLabel,
  MATCH_CRITICAL_KEYS,
} from "../candidateProfiles/rules";
import { candidateDisplayName } from "../candidates/helpers";
import { matchmakerProfileFor } from "../matchmakerProfiles/helpers";
import {
  PRACTICE_FIELD_KEYS,
  PRACTICE_FIELDS,
} from "../matchmakerProfiles/rules";
import { displayValue } from "../profiles/rules";
import {
  type Brief,
  type BriefEntry,
  type BriefedThrough,
  type BriefMessage,
  REPLY_DEFAULTS,
  settingNumber,
} from "./rules";

/*
 * ─── The three numbers, from the deployment ─────────────────────────────────
 *
 * Every one is a guess only a real matchmaker can correct (prd/phase-2.md
 * §9.2), so each is a setting rather than a constant. Unset falls back;
 * nonsense falls back; out of range clamps. None of them can take the feature
 * down, because a typo in an env var is not a reason for a matchmaker to lose
 * their drafts.
 */

/** How long after the last message before drafting. */
export function debounceSeconds(): number {
  return settingNumber(
    env.AI_REPLY_DEBOUNCE_SECONDS,
    REPLY_DEFAULTS.debounceSeconds,
    { min: 0, max: 120 },
  );
}

/** How many drafts to ask for. */
export function replyCount(): number {
  return settingNumber(env.AI_REPLY_COUNT, REPLY_DEFAULTS.count, {
    min: 1,
    max: 5,
  });
}

/** How many messages go to the agent verbatim. */
export function liveWindow(): number {
  return settingNumber(env.AI_REPLY_LIVE_WINDOW, REPLY_DEFAULTS.liveWindow, {
    min: 1,
    max: 100,
  });
}

/** An entry map as the two profile tables hold it. */
type Entries = Doc<"candidateProfiles">["facts"];

/**
 * The filled entries, rendered the way the Profile section renders them, so
 * the agent reads "Wants children: maybe" rather than `wantsKids: maybe`.
 *
 * An entry held open only by a proposal has an empty value and nothing to say.
 * **An open proposal is never part of the brief**: nobody has agreed to it, and
 * an agent told about a change the matchmaker has not accepted would draft as
 * though they had (prd/phase-2.md §4.2).
 */
function briefEntries(
  entries: Entries,
  label: (key: string) => string,
  render: (key: string, value: string) => string,
): BriefEntry[] {
  return Object.entries(entries)
    .filter(([, entry]) => entry.value !== "")
    .map(([key, entry]) => ({
      key,
      label: label(key),
      value: render(key, entry.value),
      source: entry.source,
      updatedAt: entry.updatedAt,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * How many unfilled fields the agent is shown at once.
 *
 * All thirty-one of them is a form, and an agent handed a form asks like one.
 * Enough for there to be something natural to pick up on whatever the
 * candidate just said, few enough that it reads as context rather than as a
 * queue. The list is already ordered for a conversation
 * (`MATCH_CRITICAL_KEYS`), so the cut takes the askable ones.
 */
const MAX_GAPS = 12;

/**
 * The match-critical fields with no answer on this profile, in the order it is
 * natural to ask them.
 *
 * A field held open by nothing but an unaccepted proposal counts as unknown,
 * which is the same judgement `briefEntries` makes for the opposite reason:
 * nobody has agreed to a proposal, so it is neither something the agent knows
 * nor something it should treat as asked.
 */
function gapLabels(entries: Entries | null): string[] {
  const labels: string[] = [];
  for (const key of MATCH_CRITICAL_KEYS) {
    if ((entries?.[key]?.value ?? "") !== "") continue;
    const label = candidateField(key)?.label;
    if (label === undefined) continue;
    labels.push(label);
    if (labels.length === MAX_GAPS) break;
  }
  return labels;
}

/**
 * Everything the agent gets about one conversation.
 *
 * Every message in the live window, whatever its visibility: the matchmaker's
 * private notes to themselves and the imported history included. The agent is
 * drafting for the person who wrote them, and a drafter working from half the
 * file writes worse drafts. What it may *say* is a different question, and
 * `rules.ts` marks each message so the agent knows which ones the candidate
 * has actually seen.
 */
export async function briefFor(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
  candidate: Doc<"candidates">,
  matchmaker: Doc<"matchmakers">,
  liveWindow: number,
): Promise<Brief> {
  const profile = await candidateProfileFor(ctx, candidate._id);
  const mine = await matchmakerProfileFor(ctx, matchmaker._id);

  // Newest first, then reversed: the window is the *last* N, and a thread can
  // be long. Taking from the front would be the oldest N.
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_conversationId_and_seq", (q) =>
      q.eq("conversationId", conversation._id),
    )
    .order("desc")
    .take(liveWindow);

  const messages: BriefMessage[] = recent.reverse().map((message) => ({
    seq: message.seq,
    author: message.author,
    visibility: message.visibility,
    source: message.source === "ai_suggestion" ? "typed" : message.source,
    body: message.body,
  }));

  return {
    candidateName: await candidateDisplayName(ctx, candidate),
    matchmakerName: matchmaker.displayName,
    voice: mine?.voice?.value ?? "",
    // Only the ones they have filled in, in the order the settings page shows
    // them — an empty field is nothing to tell an agent about.
    practice:
      mine === null
        ? []
        : PRACTICE_FIELDS.flatMap((field) => {
            const value =
              mine[field.key as (typeof PRACTICE_FIELD_KEYS)[number]];
            return value === undefined || value.value === ""
              ? []
              : [{ label: field.label, value: value.value }];
          }),
    facts:
      profile === null
        ? []
        : briefEntries(
            profile.facts,
            (key) => candidateField(key)?.label ?? key,
            (key, value) => {
              const field = candidateField(key);
              return field === null ? value : displayValue(field, value);
            },
          ),
    notes:
      profile === null
        ? []
        : briefEntries(
            profile.notes,
            candidateNoteLabel,
            (_key, value) => value,
          ),
    messages,
    gaps: gapLabels(profile?.facts ?? null),
  };
}

/**
 * When anything the agent is told about the *matchmaker* last moved — their
 * voice or any of the three practice fields — or 0 where they have written
 * none of it.
 *
 * One mark for all four, matching the single `agentBriefedVoiceAt` on the
 * conversation. Splitting it would mean a second field and a second way for
 * the two to disagree about what the agent has already been told, to save
 * re-sending a few hundred characters that only change when somebody edits
 * their own settings page.
 */
export async function voiceUpdatedAt(
  ctx: QueryCtx,
  matchmakerId: Id<"matchmakers">,
): Promise<number> {
  const mine = await matchmakerProfileFor(ctx, matchmakerId);
  if (mine === null) return 0;
  return [mine.voice, ...PRACTICE_FIELD_KEYS.map((key) => mine[key])].reduce(
    (latest, entry) => Math.max(latest, entry?.updatedAt ?? 0),
    0,
  );
}

/** What the agent has already been told about this conversation. */
export function briefedThrough(
  conversation: Doc<"conversations">,
): BriefedThrough {
  return {
    seq: conversation.agentBriefedSeq ?? 0,
    voiceUpdatedAt: conversation.agentBriefedVoiceAt ?? 0,
    profileUpdatedAt: conversation.agentBriefedProfileAt ?? 0,
  };
}

/**
 * The high-water mark for the profile, which is the latest `updatedAt` on any
 * entry rather than the row's own. A row's `updatedAt` moves when a *proposal*
 * is written too, and a proposal is not something the agent is told about.
 */
export function profileHighWater(brief: Brief): number {
  return [...brief.facts, ...brief.notes].reduce(
    (latest, entry) => Math.max(latest, entry.updatedAt),
    0,
  );
}

/** The drafts still waiting on this candidate, newest first. */
export async function readyDrafts(
  ctx: QueryCtx,
  candidateId: Id<"candidates">,
): Promise<Doc<"replySuggestions">[]> {
  return await ctx.db
    .query("replySuggestions")
    .withIndex("by_candidateId_and_status", (q) =>
      q.eq("candidateId", candidateId).eq("status", "ready"),
    )
    .order("desc")
    .take(10);
}

/**
 * Forgets everything the model was shown about one candidate: the agent's
 * thread, and the high-water marks that say how much of the world it has been
 * told about.
 *
 * **This is the door prd/phase-2.md §4 said an erasure had to knock on.** The
 * component's tables are its own and `ctx.db` cannot see them, so the erasure
 * in `admin/mutations.ts` cannot walk a thread the way it walks `candidates`
 * and `auditEvents` — it has to ask the component, and the component has to be
 * asked per thread.
 *
 * §4 named `components.agent.users.deleteAllForUserId`, which is the wrong
 * door for the threads this product creates: `actions.ts` creates one per
 * *conversation*, titled and keyed by nothing else, so no thread here is
 * associated with a component user id and that call would find nothing to
 * delete. Giving threads a `userId` would make it work for threads created
 * after the change and silently miss every one created before it. Walking the
 * conversations is exact, needs no backfill, and is bounded by the same
 * membership ceiling the erasure already enforces.
 *
 * Async deletion, as the per-conversation switch uses: the component removes
 * the thread's messages in batches in the background, which is what stops a
 * long thread from blowing the limits of the mutation that asked.
 *
 * Safe to call for a candidate whose conversation was never drafted for, and
 * safe to call twice.
 */
export async function forgetAgentThread(
  ctx: MutationCtx,
  candidateId: Id<"candidates">,
): Promise<boolean> {
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
    .unique();
  if (conversation === null) return false;

  // Both of them: a conversation carries one thread for drafting and one for
  // the profile agent that reconciles what drafting noticed. Forgetting only
  // the first would leave the model's copy of a person standing in the other
  // (prd/phase-2.md §4.1B).
  const threads = [
    conversation.agentThreadId,
    conversation.profileThreadId,
  ].filter((threadId): threadId is string => threadId !== undefined);
  if (threads.length === 0) return false;

  for (const threadId of threads) {
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId,
    });
  }
  await ctx.db.patch("conversations", conversation._id, {
    agentThreadId: undefined,
    agentBriefedSeq: undefined,
    agentBriefedVoiceAt: undefined,
    agentBriefedProfileAt: undefined,
    profileThreadId: undefined,
    profileBriefedAt: undefined,
  });
  return true;
}
