/**
 * Rebuilds the e2e world from `./fixture.ts`.
 *
 * Two **internal** mutations, driven by `apps/e2e/fixtures/global-setup.ts`:
 *
 *   reset — deletes every row the seed owns, one page at a time. Reports
 *           whether it finished, so the caller loops rather than risking one
 *           oversized transaction.
 *   apply — writes the whole fixture in a single transaction and returns a
 *           manifest mapping fixture slugs to the ids they were written as.
 *           Atomic: a fixture that fails validation leaves the database exactly
 *           as it was.
 *
 * They are `internalMutation` rather than `mutation` on purpose. These wipe the
 * database; exposing them as public functions would put "delete everything" on
 * the public API of any app built from this template. The suite reaches them
 * with the local backend's admin key instead — see `apps/e2e/local-backend.ts`.
 *
 * THIS IS DESTRUCTIVE. It is only ever pointed at the local backend, and
 * `assertLocalBackendIdentity` runs before it to prove that backend is this
 * project's and not another one that happened to claim the port.
 */

import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, internalQuery } from "../../_generated/server";
import {
  SEED_ADMINS,
  SEED_CODE_TARGET,
  SEED_INVITES,
  SEED_MATCHMAKERS,
  SEED_MEMBERSHIPS,
  SEED_NOT_ADMIN,
  SEED_USERS,
} from "./fixture";

/**
 * Identity probe for `assertLocalBackendIdentity`, and the only reliable half
 * of it.
 *
 * Comparing `/instance_name` against `config.json` catches a *named* local
 * deployment (`local-<team>-<project>`), but this repo provisions an anonymous
 * one, and the Convex CLI names every anonymous agent-mode deployment
 * `anonymous-agent`. Two projects using this template on one machine would
 * therefore agree on the name while being entirely different databases.
 *
 * Reaching this function proves two things a name cannot:
 *   - the caller's admin key was accepted, and admin keys are per-deployment;
 *   - this project's own code is what is deployed there.
 *
 * It is an `internalQuery`, so it is unreachable from the public API and reads
 * nothing.
 */
export const ping = internalQuery({
  args: {},
  returns: v.literal("matchmaker-e2e"),
  handler: async () => "matchmaker-e2e" as const,
});

/**
 * Every table the seed wipes. `reset` clears these and nothing else.
 *
 * That is every table except the static-hosting components' own (which live
 * outside this schema) — including Convex Auth's, so no session or sign-in
 * code survives from an earlier run, and the tables specs write to without the
 * fixture (a new sign-up writes `users`, `auditEvents`, `emailOutbox`). A table
 * that is written but never reset accumulates across runs, and the first
 * symptom is a duplicate-row assertion failing in a test that looks unrelated.
 */
const SEEDED_TABLES = [
  "authAccounts",
  "authSessions",
  "authRefreshTokens",
  "authVerificationCodes",
  "authVerifiers",
  "authRateLimits",
  "users",
  "matchmakers",
  "candidates",
  "conversations",
  "messages",
  "notes",
  "auditEvents",
  "pushSubscriptions",
  "notificationSettings",
  "notifications",
  "emailOutbox",
  "waitlist",
] as const;

/** Bounded so a large table cannot blow the transaction limit in one call. */
const RESET_PAGE_SIZE = 200;

/** Invites seeded here never expire within a run. */
const SEED_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const reset = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async (ctx) => {
    let deleted = 0;
    let done = true;

    for (const table of SEEDED_TABLES) {
      // `.take()` rather than `.collect()`: the point of paging is to never
      // load an unbounded table into one transaction.
      const page = await ctx.db.query(table).take(RESET_PAGE_SIZE);
      for (const doc of page) {
        await ctx.db.delete(doc._id);
        deleted += 1;
      }
      if (page.length === RESET_PAGE_SIZE) done = false;
    }

    return { deleted, done };
  },
});

export const apply = internalMutation({
  args: {},
  returns: v.object({
    users: v.record(v.string(), v.id("users")),
    matchmakers: v.record(v.string(), v.id("matchmakers")),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const users: Record<string, Id<"users">> = {};
    const matchmakers: Record<string, Id<"matchmakers">> = {};

    // Verified accounts with no `authAccounts` row yet: the first sign-in
    // links to them by email, exactly as for any existing user.
    for (const user of [
      ...SEED_USERS,
      ...SEED_ADMINS,
      SEED_CODE_TARGET,
      SEED_NOT_ADMIN,
    ]) {
      users[user.slug] = await ctx.db.insert("users", {
        email: user.email,
        name: user.name,
        emailVerificationTime: now,
      });
    }

    for (const profile of SEED_MATCHMAKERS) {
      const matchmakerId = await ctx.db.insert("matchmakers", {
        ownerUserId: users[profile.ownerSlug],
        username: profile.username,
        usernameKey: profile.username.replaceAll(".", ""),
        displayName: profile.displayName,
      });
      matchmakers[profile.slug] = matchmakerId;
      // As `matchmakers.create` records it, so the admin trail has one event
      // per profile to filter by.
      await ctx.db.insert("auditEvents", {
        matchmakerId,
        actor: {
          type: "user",
          userId: users[profile.ownerSlug],
          role: "matchmaker",
        },
        action: "matchmaker.created",
        entityTable: "matchmakers",
        entityId: matchmakerId,
      });
    }

    for (const membership of SEED_MEMBERSHIPS) {
      const user = SEED_USERS.find((u) => u.slug === membership.userSlug);
      if (user === undefined) {
        throw new Error(`Unknown seed user "${membership.userSlug}"`);
      }
      const matchmakerId = matchmakers[membership.matchmakerSlug];
      const candidateId = await ctx.db.insert("candidates", {
        matchmakerId,
        userId: users[membership.userSlug],
        email: user.email,
        socialHandles: [],
        membership: "joined",
        membershipChangedAt: now,
        status: "active",
      });
      await ctx.db.insert("conversations", {
        matchmakerId,
        candidateId,
        lastSeq: 0,
        lastPublicSeq: 0,
        lastMessageAt: now,
        matchmakerLastReadSeq: 0,
        candidateLastReadSeq: 0,
      });
    }

    for (const invite of SEED_INVITES) {
      await ctx.db.insert("candidates", {
        matchmakerId: matchmakers[invite.matchmakerSlug],
        email: invite.email,
        socialHandles: [],
        membership: "invited",
        membershipChangedAt: now,
        status: "active",
        // No spec opens this invite by link, so the hash matches no token.
        invite: {
          tokenHash: `seed-${invite.slug}`,
          expiresAt: now + SEED_INVITE_TTL_MS,
        },
      });
    }

    return { users, matchmakers };
  },
});
