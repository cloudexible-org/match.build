import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "./helpers";

/**
 * The signed-in account, or `null` when signed out. `name` is absent until the
 * person completes sign-up (the app then asks for it).
 */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    return { _id: user._id, name: user.name, email: user.email };
  },
});

// Bounds for the home page. Far above what the UI allows today (one
// matchmaker profile), so they only guard against runaway reads.
const MAX_MATCHMAKER_PROFILES = 20;
const MAX_CANDIDATE_PROFILES = 100;
const MAX_INVITATIONS = 50;

/**
 * Everything the home page lists (prd/phase-1.md §2), or `null` when signed
 * out:
 *
 * - `invitations` — open invites addressed to this account's verified email:
 *   candidate rows with `membership: "invited"` and an `invite`.
 * - `matchmakerProfiles` — profiles this account owns.
 * - `candidateProfiles` — matchmakers this account has joined.
 *
 * Expired invites have their `invite` cleared by a scheduled job, not filtered
 * by time here: queries must not read the clock.
 */
export const home = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      invitations: v.array(
        v.object({
          candidateId: v.id("candidates"),
          matchmakerDisplayName: v.string(),
        }),
      ),
      matchmakerProfiles: v.array(
        v.object({
          matchmakerId: v.id("matchmakers"),
          username: v.string(),
          displayName: v.string(),
        }),
      ),
      candidateProfiles: v.array(
        v.object({
          candidateId: v.id("candidates"),
          matchmakerUsername: v.string(),
          matchmakerDisplayName: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;

    const owned = await ctx.db
      .query("matchmakers")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .take(MAX_MATCHMAKER_PROFILES);
    const ownedIds = new Set(owned.map((profile) => profile._id));

    const memberships = await ctx.db
      .query("candidates")
      .withIndex("by_userId_and_matchmakerId", (q) => q.eq("userId", user._id))
      .take(MAX_CANDIDATE_PROFILES);
    const candidateProfiles = [];
    for (const candidate of memberships) {
      if (candidate.membership !== "joined") continue;
      const matchmaker = await ctx.db.get(
        "matchmakers",
        candidate.matchmakerId,
      );
      if (matchmaker === null) continue;
      candidateProfiles.push({
        candidateId: candidate._id,
        matchmakerUsername: matchmaker.username,
        matchmakerDisplayName: matchmaker.displayName,
      });
    }

    // Only a verified address may claim invitations addressed to it.
    const invitations = [];
    if (user.email !== undefined && user.emailVerificationTime !== undefined) {
      const email = user.email;
      const invited = await ctx.db
        .query("candidates")
        .withIndex("by_email_and_membership", (q) =>
          q.eq("email", email).eq("membership", "invited"),
        )
        .take(MAX_INVITATIONS);
      for (const candidate of invited) {
        // Only an open invite, and never one from your own profile to your own
        // email — that one can't be accepted.
        if (
          candidate.invite === undefined ||
          ownedIds.has(candidate.matchmakerId)
        ) {
          continue;
        }
        const matchmaker = await ctx.db.get(
          "matchmakers",
          candidate.matchmakerId,
        );
        if (matchmaker === null) continue;
        invitations.push({
          candidateId: candidate._id,
          matchmakerDisplayName: matchmaker.displayName,
        });
      }
    }

    return {
      invitations,
      matchmakerProfiles: owned.map((profile) => ({
        matchmakerId: profile._id,
        username: profile.username,
        displayName: profile.displayName,
      })),
      candidateProfiles,
    };
  },
});
