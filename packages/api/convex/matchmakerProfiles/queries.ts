/**
 * Reading a matchmaker's own profile (prd/phase-2.md §4.1C). Theirs alone:
 * `requireMatchmaker` proves the signed-in account owns the workspace, and
 * nothing else — no candidate, no other matchmaker — has a route here.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireMatchmaker } from "../matchmakers/helpers";
import { profileEntry } from "../schema";
import { matchmakerProfileFor } from "./helpers";

export const get = query({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.object({
    voice: v.union(profileEntry, v.null()),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const profile = await matchmakerProfileFor(ctx, matchmaker._id);
    return {
      voice: profile?.voice ?? null,
      updatedAt: profile?.updatedAt ?? 0,
    };
  },
});
