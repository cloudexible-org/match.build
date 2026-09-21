/**
 * Reading a candidate's profile (prd/phase-2.md §3). Matchmaker-only: a
 * candidate has no route to their own profile, which is a product decision and
 * not a legal one (§7, §9.3).
 *
 * The stored entries come back as they are and the app composes them with the
 * registry it already imports through `@repo/api`, so there is one description
 * of a field and not a second one shaped for a screen.
 */

import { type Infer, v } from "convex/values";
import { query } from "../_generated/server";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { profileEntry } from "../schema";
import { candidateProfileFor } from "./helpers";

const profileShape = v.object({
  facts: v.record(v.string(), profileEntry),
  notes: v.record(v.string(), profileEntry),
  updatedAt: v.number(),
});

/** An unwritten profile is empty, not absent: the form is the same either way. */
const EMPTY: Infer<typeof profileShape> = {
  facts: {},
  notes: {},
  updatedAt: 0,
};

export const get = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
  },
  returns: profileShape,
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    const profile = await candidateProfileFor(ctx, candidate._id);
    if (profile === null) return EMPTY;
    return {
      facts: profile.facts,
      notes: profile.notes,
      updatedAt: profile.updatedAt,
    };
  },
});
