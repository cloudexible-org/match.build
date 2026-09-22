/**
 * Reading and writing a matchmaker's own profile (prd/phase-2.md §4.1C).
 * Plain functions taking a `ctx`; nothing here is registered as a function.
 *
 * The write engine is `convex/profiles/helpers.ts`, shared with a candidate's
 * profile — which is the point of it being shared: "an agent never overwrites
 * what a person typed" holds for a matchmaker's voice exactly as it does for a
 * candidate's birth date.
 */

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import {
  type AiSwitches,
  aiFunctionStates,
  settingNumber,
} from "../replySuggestions/rules";
import { VOICE_SAMPLE_MESSAGES } from "./rules";

/**
 * A profile row is created lazily, on the first value written. Until then
 * there is nothing to read, and `null` is the honest answer.
 */
export async function matchmakerProfileFor(
  ctx: QueryCtx,
  matchmakerId: Id<"matchmakers">,
): Promise<Doc<"matchmakerProfiles"> | null> {
  return await ctx.db
    .query("matchmakerProfiles")
    .withIndex("by_matchmakerId", (q) => q.eq("matchmakerId", matchmakerId))
    .unique();
}

export async function ensureMatchmakerProfile(
  ctx: MutationCtx,
  matchmakerId: Id<"matchmakers">,
): Promise<Doc<"matchmakerProfiles">> {
  const existing = await matchmakerProfileFor(ctx, matchmakerId);
  if (existing !== null) return existing;
  const id = await ctx.db.insert("matchmakerProfiles", {
    matchmakerId,
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get("matchmakerProfiles", id);
  if (created === null) throw new Error("The profile vanished as it was made.");
  return created;
}

/** How many sent messages between voice runs, from the deployment. */
export function voiceSampleMessages(): number {
  return settingNumber(
    env.AI_VOICE_SAMPLE_MESSAGES,
    VOICE_SAMPLE_MESSAGES,
    // Never zero: a run per message is what §4.1C says this must not be.
    { min: 5, max: 500 },
  );
}

/**
 * Counts one message the matchmaker sent, and wakes the voice agent when
 * enough of them have gone by (prd/phase-2.md §4.1C).
 *
 * **The count is the trigger, not a timer.** A matchmaker who writes twenty
 * messages in an afternoon gets a voice that afternoon; one who writes two a
 * week waits, which is right — there is nothing to distil from two messages
 * that was not already there.
 *
 * Called from `messages/mutations.ts` on every message they send, so it does
 * one read and at most one write, and schedules rather than generates.
 */
export async function noteSentMessage(
  ctx: MutationCtx,
  matchmakerId: Id<"matchmakers">,
  conversation: AiSwitches,
): Promise<void> {
  // A conversation whose voice switch is off is not a sample, so it does not
  // count towards the next run either. Counting it would wake the agent early
  // over a window `voiceContext` is about to filter most of out of.
  if (!aiFunctionStates(conversation).voice) return;
  const profile = await ensureMatchmakerProfile(ctx, matchmakerId);
  const sentMessages = (profile.sentMessages ?? 0) + 1;
  const every = voiceSampleMessages();
  // `voiceReadThrough` absent means never read, so the first run waits for a
  // full sample rather than firing on message one.
  const due = sentMessages - (profile.voiceReadThrough ?? 0) >= every;

  await ctx.db.patch("matchmakerProfiles", profile._id, {
    sentMessages,
    // Claimed here rather than in the action, so two messages landing either
    // side of the threshold cannot schedule two runs over the same sample.
    // A run that then fails costs this matchmaker one cycle's wait, which is
    // a better failure than two generations racing into one proposal.
    ...(due ? { voiceReadThrough: sentMessages } : {}),
  });

  if (due) {
    await ctx.scheduler.runAfter(
      0,
      internal.matchmakerProfiles.actions.distil,
      { matchmakerId },
    );
  }
}
