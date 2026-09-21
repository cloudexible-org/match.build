/**
 * Reading and writing a candidate's profile (prd/phase-2.md §3). Plain
 * functions taking a `ctx`; nothing here is registered as a function.
 *
 * The write engine itself is in `convex/profiles/helpers.ts`, shared with the
 * matchmaker's profile. This file is the candidate-shaped wrapper around it:
 * the row, the two maps, and the ceiling on how many notes one may hold.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ERASED_VALUE } from "../audit/rules";
import type { ProfileEntries } from "../profiles/helpers";
import { PROFILE_LIMITS } from "../profiles/rules";
import { candidateField } from "./rules";

/**
 * A profile row is created lazily, on the first value anyone writes. Until
 * then there is nothing to read, and `null` is the honest answer — an empty
 * row written at onboarding would be a row per candidate saying nothing.
 */
export async function candidateProfileFor(
  ctx: QueryCtx,
  candidateId: Id<"candidates">,
): Promise<Doc<"candidateProfiles"> | null> {
  return await ctx.db
    .query("candidateProfiles")
    .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
    .unique();
}

/** The row for this candidate, created on first write. */
export async function ensureCandidateProfile(
  ctx: MutationCtx,
  candidate: Doc<"candidates">,
): Promise<Doc<"candidateProfiles">> {
  const existing = await candidateProfileFor(ctx, candidate._id);
  if (existing !== null) return existing;
  const id = await ctx.db.insert("candidateProfiles", {
    matchmakerId: candidate.matchmakerId,
    candidateId: candidate._id,
    facts: {},
    notes: {},
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get("candidateProfiles", id);
  if (created === null) throw new Error("The profile vanished as it was made.");
  return created;
}

/** How many free-text notes a profile is allowed to carry. */
export function noteCountError(
  notes: ProfileEntries,
  key: string,
): string | null {
  if (key in notes) return null;
  return Object.keys(notes).length >= PROFILE_LIMITS.notes
    ? `A profile holds at most ${PROFILE_LIMITS.notes} notes. Remove one first.`
    : null;
}

/**
 * Erases the person out of a matchmaker's profile of them, leaving the record
 * itself standing exactly as the rest of their book does (prd/phase-1.md §12).
 *
 * It replaces the values of the registry fields marked `personal` — a birth
 * date, a city, an occupation, and the special categories — and leaves
 * everything else. "Wants children: yes" says what the matchmaker was working
 * with, not who it was, in the same way `status` and `membership` survive in
 * the trail.
 *
 * The free-text notes are untouched, on the same grounds as the note and
 * message bodies phase 1 deliberately left alone: they are the matchmaker's
 * own words.
 *
 * Returns whether it changed anything, so the caller can report it.
 */
export async function anonymiseCandidateProfile(
  ctx: MutationCtx,
  candidateId: Id<"candidates">,
): Promise<boolean> {
  const profile = await candidateProfileFor(ctx, candidateId);
  if (profile === null) return false;

  let changed = false;
  const facts: ProfileEntries = {};
  for (const [key, entry] of Object.entries(profile.facts)) {
    if (!candidateField(key)?.personal) {
      facts[key] = entry;
      continue;
    }
    changed = true;
    // A pending suggestion is another copy of the same value, so it goes too.
    const { pending: _dropped, ...rest } = entry;
    facts[key] = { ...rest, value: ERASED_VALUE, sourceQuote: undefined };
  }
  if (!changed) return false;
  await ctx.db.patch("candidateProfiles", profile._id, { facts });
  return true;
}
