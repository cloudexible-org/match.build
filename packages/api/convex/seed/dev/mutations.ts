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
 * run where RESEND_API_KEY is set: that is production, where `.test` accounts
 * could never receive a sign-in code anyway.
 */

import { ConvexError, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { env, internalMutation } from "../../_generated/server";
import { findLiveUserByEmail } from "../../users/helpers";
import {
  DEV_INVITED_SLUGS,
  DEV_MATCHMAKER,
  DEV_MEMBERS,
  DEV_USERS,
  type DevUser,
} from "./fixture";

/** Seeded invites stay open for a year; nothing opens them by link. */
const DEV_INVITE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function devUser(slug: string): DevUser {
  const user = DEV_USERS.find((u) => u.slug === slug);
  if (user === undefined) throw new Error(`Unknown dev user "${slug}"`);
  return user;
}

export const apply = internalMutation({
  args: {},
  returns: v.object({
    created: v.array(v.string()),
    accounts: v.array(v.object({ email: v.string(), role: v.string() })),
  }),
  handler: async (ctx) => {
    if (env.RESEND_API_KEY !== undefined) {
      throw new ConvexError(
        "Refusing to seed: RESEND_API_KEY is set, so this is not a dev deployment.",
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
      if (existing !== null) continue;

      const candidateId = await ctx.db.insert("candidates", {
        matchmakerId,
        userId: users[member.userSlug],
        email: user.email,
        socialHandles: [],
        membership: "joined",
        membershipChangedAt: now,
        status: "active",
      });

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
          authorUserId:
            message.author === "matchmaker"
              ? users[DEV_MATCHMAKER.ownerSlug]
              : users[member.userSlug],
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
      created.push(`member ${user.email}`);
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
