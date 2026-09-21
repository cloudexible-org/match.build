/**
 * Adds the test accounts in `./fixture.ts` to the cloud dev deployment.
 *
 *   pnpm --filter @repo/api seed:dev
 *
 * Additive and idempotent: every row is looked up before it is written, and
 * nothing is updated or deleted. Re-running after the data has drifted (a
 * candidate left, a message was sent) leaves those changes alone.
 *
 * An `internalMutation`, so only an admin key can run it. It also refuses to
 * run unless SITE_URL is a `.localhost` origin (only the dev deployment's app
 * runs there) and RESEND_API_KEY is unset (`.test` accounts can only sign in
 * through the outbox).
 */

import { ConvexError, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import {
  env,
  internalMutation,
  type MutationCtx,
} from "../../_generated/server";
import { findLiveUserByEmail } from "../../users/helpers";
import {
  DEV_INVITED_SLUGS,
  DEV_MATCHMAKER,
  DEV_MEMBERS,
  DEV_USERS,
  type DevMember,
  type DevProfile,
  type DevUser,
} from "./fixture";

/** Seeded invites stay open for a year; nothing opens them by link. */
const DEV_INVITE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function isLocalhostSite(siteUrl: string | undefined): boolean {
  if (siteUrl === undefined) return false;
  try {
    const { hostname } = new URL(siteUrl);
    return hostname === "localhost" || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function devUser(slug: string): DevUser {
  const user = DEV_USERS.find((u) => u.slug === slug);
  if (user === undefined) throw new Error(`Unknown dev user "${slug}"`);
  return user;
}

type ProfileEntries = Record<
  string,
  {
    value: string;
    source: "matchmaker" | "agent" | "agent_approved";
    updatedAt: number;
    model?: string;
    sourceQuote?: string;
    pending?: {
      action: "set" | "clear";
      value: string;
      suggestedAt: number;
      model: string;
      sourceQuote?: string;
    };
  }
>;

/**
 * A `DevProfile` as the two entry maps the table holds.
 *
 * A proposal is written straight onto the entry rather than through
 * `applyAgentEntries`, because that path decides between writing and
 * suggesting from the field's policy — and what dev needs is an open proposal
 * on each of these fields whatever their policy says.
 */
function profileEntries(
  profile: DevProfile,
  now: number,
): { facts: ProfileEntries; notes: ProfileEntries } {
  const maps: { facts: ProfileEntries; notes: ProfileEntries } = {
    facts: {},
    notes: {},
  };
  for (const [key, value] of Object.entries(profile.facts ?? {})) {
    maps.facts[key] = { value, source: "matchmaker", updatedAt: now };
  }
  for (const [key, value] of Object.entries(profile.notes ?? {})) {
    maps.notes[key] = { value, source: "matchmaker", updatedAt: now };
  }
  for (const suggestion of profile.suggestions ?? []) {
    const map = maps[suggestion.kind];
    const existing = map[suggestion.key];
    map[suggestion.key] = {
      // A proposal sits beside the value, never instead of it.
      value: suggestion.current ?? existing?.value ?? "",
      source: existing?.source ?? "agent",
      updatedAt: now,
      pending: {
        action: suggestion.remove === true ? "clear" : "set",
        value: suggestion.remove === true ? "" : suggestion.value,
        suggestedAt: now,
        model: "seed/model",
        sourceQuote: suggestion.quote,
      },
    };
  }
  return maps;
}

/**
 * One joined (or since-departed) member: the candidate, their conversation and
 * its messages. Split out so the loop can tell "this person is new" from
 * "this person's profile is new" — a dev database seeded before profiles
 * existed needs the second without the first.
 */
async function seedMember(
  ctx: MutationCtx,
  args: {
    member: DevMember;
    matchmakerId: Id<"matchmakers">;
    ownerUserId: Id<"users">;
    userId: Id<"users">;
    email: string;
    now: number;
  },
): Promise<Id<"candidates">> {
  const { member, matchmakerId, ownerUserId, userId, email, now } = args;
  const left = member.left;

  const candidateId = await ctx.db.insert("candidates", {
    matchmakerId,
    userId,
    email,
    socialHandles: [],
    membership: left === undefined ? "joined" : "left",
    membershipChangedAt:
      left === undefined ? now : now - left.daysAgo * 24 * 60 * 60 * 1000,
    leaveReason: left?.reason,
    status: "active",
  });

  if (left !== undefined) {
    // The event the product would have written, so History reads the same.
    await ctx.db.insert("auditEvents", {
      matchmakerId,
      candidateId,
      actor: { type: "user", userId, role: "candidate" },
      action: "membership.left",
      entityTable: "candidates",
      entityId: candidateId,
      changes: [
        {
          field: "membership",
          before: JSON.stringify("joined"),
          after: JSON.stringify("left"),
        },
      ],
      reason: left.reason,
    });
  }

  const conversationId = await ctx.db.insert("conversations", {
    matchmakerId,
    candidateId,
    lastSeq: 0,
    lastPublicSeq: 0,
    lastMessageAt: now,
    matchmakerLastReadSeq: 0,
    candidateLastReadSeq: 0,
  });

  let seq = 0;
  let lastPublicSeq = 0;
  for (const [index, message] of member.messages.entries()) {
    seq += 1;
    if (message.visibility === "everyone") lastPublicSeq = seq;
    await ctx.db.insert("messages", {
      matchmakerId,
      conversationId,
      seq,
      author: message.author,
      authorUserId: message.author === "matchmaker" ? ownerUserId : userId,
      visibility: message.visibility,
      source: "typed",
      body: message.body,
      // Spread a minute apart so the thread reads in order.
      sentAt: now - (member.messages.length - index) * 60_000,
    });
  }
  await ctx.db.patch("conversations", conversationId, {
    lastSeq: seq,
    lastPublicSeq,
    matchmakerLastReadSeq: seq,
    candidateLastReadSeq: lastPublicSeq,
  });

  return candidateId;
}

export const apply = internalMutation({
  args: {},
  returns: v.object({
    created: v.array(v.string()),
    accounts: v.array(v.object({ email: v.string(), role: v.string() })),
  }),
  handler: async (ctx) => {
    if (!isLocalhostSite(env.SITE_URL) || env.RESEND_API_KEY !== undefined) {
      throw new ConvexError(
        "Refusing to seed: SITE_URL is not on .localhost or RESEND_API_KEY is set, so this is not a dev deployment.",
      );
    }

    const now = Date.now();
    const created: string[] = [];
    const users: Record<string, Id<"users">> = {};

    // Verified accounts with no `authAccounts` row: the first sign-in links to
    // them by email, as for any existing user.
    for (const user of DEV_USERS) {
      const existing = await findLiveUserByEmail(ctx, user.email);
      if (existing !== null) {
        users[user.slug] = existing._id;
        continue;
      }
      users[user.slug] = await ctx.db.insert("users", {
        email: user.email,
        name: user.name,
        emailVerificationTime: now,
      });
      created.push(`user ${user.email}`);
    }

    const usernameKey = DEV_MATCHMAKER.username.replaceAll(".", "");
    let matchmaker = await ctx.db
      .query("matchmakers")
      .withIndex("by_usernameKey", (q) => q.eq("usernameKey", usernameKey))
      .unique();
    if (matchmaker === null) {
      const id = await ctx.db.insert("matchmakers", {
        ownerUserId: users[DEV_MATCHMAKER.ownerSlug],
        username: DEV_MATCHMAKER.username,
        usernameKey,
        displayName: DEV_MATCHMAKER.displayName,
        businessName: DEV_MATCHMAKER.businessName,
      });
      matchmaker = await ctx.db.get("matchmakers", id);
      created.push(`matchmaker ${DEV_MATCHMAKER.username}`);
    }
    if (matchmaker === null) throw new Error("Matchmaker insert failed.");
    const matchmakerId = matchmaker._id;

    for (const member of DEV_MEMBERS) {
      const user = devUser(member.userSlug);
      const existing = await ctx.db
        .query("candidates")
        .withIndex("by_matchmakerId_and_email", (q) =>
          q.eq("matchmakerId", matchmakerId).eq("email", user.email),
        )
        .first();

      // Resolved either way: profiles arrived after these accounts did, so a
      // dev database seeded before them still gains one on a re-run.
      let candidateId: Id<"candidates">;
      if (existing !== null) {
        candidateId = existing._id;
      } else {
        candidateId = await seedMember(ctx, {
          member,
          matchmakerId,
          ownerUserId: users[DEV_MATCHMAKER.ownerSlug],
          userId: users[member.userSlug],
          email: user.email,
          now,
        });
        created.push(
          `member ${user.email}${member.left === undefined ? "" : " (left)"}`,
        );
      }

      if (member.profile !== undefined) {
        const seeded = await ctx.db
          .query("candidateProfiles")
          .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
          .unique();
        if (seeded === null) {
          const { facts, notes } = profileEntries(member.profile, now);
          await ctx.db.insert("candidateProfiles", {
            matchmakerId,
            candidateId,
            facts,
            notes,
            updatedAt: now,
          });
          created.push(`profile for ${user.email}`);
        }
      }
    }

    const mineSeeded = await ctx.db
      .query("matchmakerProfiles")
      .withIndex("by_matchmakerId", (q) => q.eq("matchmakerId", matchmakerId))
      .unique();
    if (mineSeeded === null) {
      await ctx.db.insert("matchmakerProfiles", {
        matchmakerId,
        voice: {
          value: DEV_MATCHMAKER.voice,
          source: "matchmaker",
          updatedAt: now,
          pending: {
            action: "set",
            value: DEV_MATCHMAKER.voiceSuggestion,
            suggestedAt: now,
            model: "seed/model",
          },
        },
        updatedAt: now,
      });
      created.push(`voice for ${DEV_MATCHMAKER.username}`);
    }

    for (const slug of DEV_INVITED_SLUGS) {
      const user = devUser(slug);
      const existing = await ctx.db
        .query("candidates")
        .withIndex("by_matchmakerId_and_email", (q) =>
          q.eq("matchmakerId", matchmakerId).eq("email", user.email),
        )
        .first();
      if (existing !== null) continue;

      await ctx.db.insert("candidates", {
        matchmakerId,
        name: user.name,
        email: user.email,
        socialHandles: [],
        membership: "invited",
        membershipChangedAt: now,
        status: "active",
        // No link carries this token; accept from the home page instead.
        invite: {
          tokenHash: `dev-seed-${slug}`,
          expiresAt: now + DEV_INVITE_TTL_MS,
        },
      });
      created.push(`invite ${user.email}`);
    }

    const accounts = DEV_USERS.map(({ email, role }) => ({ email, role }));

    return { created, accounts };
  },
});
