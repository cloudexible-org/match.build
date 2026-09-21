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
import { inviteTokenFor, newInvite } from "../../invites/helpers";
import {
  SEED_ADMINS,
  SEED_CODE_TARGET,
  SEED_INVITES,
  SEED_MATCHMAKERS,
  SEED_MEMBERSHIPS,
  SEED_NOT_ADMIN,
  SEED_USERS,
} from "./fixture";
import {
  NS_PATTERN,
  type ScenarioManifest,
  scenarioEmail,
  scenarioName,
  scenarioUsername,
} from "./scenario";

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
  // Global AI agent settings (prd/phase-2.md §4.4). Written by
  // specs/admin-convex/ai-settings.spec.ts, and there is one row per agent for
  // the whole deployment rather than one per test — so a run that left them
  // behind would both leak into the next and, after any schema change to the
  // table, fail the push outright on rows that no longer validate.
  "aiAgentSettings",
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

/*
 * ─── Per-file scenarios ─────────────────────────────────────────────────────
 *
 * See `./scenario.ts` for what a scenario is and why. Everything below writes
 * only rows carrying the caller's namespace, and reads nothing else, so two
 * spec files seeding at the same time cannot collide.
 */

const scenarioPlatform = v.union(
  v.literal("instagram"),
  v.literal("whatsapp"),
  v.literal("tiktok"),
  v.literal("facebook"),
  v.literal("x"),
  v.literal("linkedin"),
  v.literal("other"),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const MESSAGE_GAP_MS = 60 * 1000;

export const scenario = internalMutation({
  args: {
    ns: v.string(),
    users: v.optional(
      v.array(
        v.object({
          key: v.string(),
          email: v.optional(v.string()),
          name: v.optional(v.string()),
          verified: v.optional(v.boolean()),
          deleted: v.optional(v.boolean()),
          pushEndpoint: v.optional(v.string()),
        }),
      ),
    ),
    matchmakers: v.optional(
      v.array(
        v.object({
          key: v.string(),
          ownerKey: v.string(),
          username: v.optional(v.string()),
          displayName: v.optional(v.string()),
          businessName: v.optional(v.string()),
        }),
      ),
    ),
    candidates: v.optional(
      v.array(
        v.object({
          key: v.string(),
          matchmakerKey: v.string(),
          userKey: v.optional(v.string()),
          email: v.optional(v.string()),
          name: v.optional(v.string()),
          membership: v.optional(
            v.union(
              v.literal("invited"),
              v.literal("declined"),
              v.literal("joined"),
              v.literal("left"),
              v.literal("account_deleted"),
            ),
          ),
          status: v.optional(
            v.union(
              v.literal("active"),
              v.literal("paused"),
              v.literal("archived"),
            ),
          ),
          socialHandles: v.optional(
            v.array(
              v.object({ platform: scenarioPlatform, handle: v.string() }),
            ),
          ),
          invite: v.optional(
            v.union(v.literal("open"), v.literal("expired"), v.literal("none")),
          ),
          membershipChangedDaysAgo: v.optional(v.number()),
          leaveReason: v.optional(v.string()),
          invitesSentToday: v.optional(v.number()),
          messages: v.optional(
            v.array(
              v.object({
                author: v.union(
                  v.literal("matchmaker"),
                  v.literal("candidate"),
                  v.literal("system"),
                ),
                visibility: v.optional(
                  v.union(v.literal("everyone"), v.literal("matchmaker")),
                ),
                source: v.optional(
                  v.union(
                    v.literal("typed"),
                    v.literal("imported"),
                    v.literal("system"),
                  ),
                ),
                body: v.string(),
              }),
            ),
          ),
          unreadForMatchmaker: v.optional(v.boolean()),
          notes: v.optional(v.array(v.string())),
        }),
      ),
    ),
  },
  returns: v.object({
    ns: v.string(),
    users: v.record(
      v.string(),
      v.object({ id: v.string(), email: v.string(), name: v.string() }),
    ),
    matchmakers: v.record(
      v.string(),
      v.object({
        id: v.string(),
        username: v.string(),
        displayName: v.string(),
      }),
    ),
    candidates: v.record(
      v.string(),
      v.object({
        id: v.string(),
        email: v.string(),
        conversationId: v.string(),
        inviteToken: v.union(v.null(), v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const ns = args.ns;
    if (!NS_PATTERN.test(ns)) {
      throw new Error(
        `Scenario namespace "${ns}" must be 4–12 lowercase letters/digits starting with a letter.`,
      );
    }
    const now = Date.now();

    const users: ScenarioManifest["users"] = {};
    const userIds: Record<string, Id<"users">> = {};
    for (const user of args.users ?? []) {
      const email = user.email ?? scenarioEmail(user.key, ns);
      const name = user.name ?? scenarioName(user.key);
      const id = await ctx.db.insert("users", {
        email,
        name,
        emailVerificationTime: user.verified === false ? undefined : now,
        deletedAt: user.deleted === true ? now : undefined,
      });
      userIds[user.key] = id;
      users[user.key] = { id, email, name };
      if (user.pushEndpoint !== undefined) {
        await ctx.db.insert("pushSubscriptions", {
          userId: id,
          endpoint: user.pushEndpoint,
          // The receiver half of RFC 8291 §5's vector: a real P-256 point and
          // a real 16-byte auth secret, so encryption actually succeeds.
          p256dh:
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
          auth: "BTBZMqHH6r4Tts7J_aSIgg",
          userAgent: "e2e",
        });
      }
    }

    const matchmakers: ScenarioManifest["matchmakers"] = {};
    const matchmakerIds: Record<string, Id<"matchmakers">> = {};
    for (const profile of args.matchmakers ?? []) {
      const ownerUserId = userIds[profile.ownerKey];
      if (ownerUserId === undefined) {
        throw new Error(`Scenario "${ns}": no user "${profile.ownerKey}"`);
      }
      const username = profile.username ?? scenarioUsername(profile.key, ns);
      const displayName =
        profile.displayName ?? `${scenarioName(profile.key)} ${ns}`;
      const id = await ctx.db.insert("matchmakers", {
        ownerUserId,
        username,
        usernameKey: username.replaceAll(".", ""),
        displayName,
        businessName: profile.businessName,
      });
      matchmakerIds[profile.key] = id;
      matchmakers[profile.key] = { id, username, displayName };
      // The events the product would have written, so History reads the same
      // as it would for a profile created through the UI.
      await ctx.db.insert("auditEvents", {
        matchmakerId: id,
        actor: { type: "user", userId: ownerUserId, role: "matchmaker" },
        action: "matchmaker.created",
        entityTable: "matchmakers",
        entityId: id,
        changes: [
          { field: "username", after: JSON.stringify(username) },
          { field: "displayName", after: JSON.stringify(displayName) },
        ],
      });
    }

    const candidates: ScenarioManifest["candidates"] = {};
    for (const spec of args.candidates ?? []) {
      const matchmakerId = matchmakerIds[spec.matchmakerKey];
      if (matchmakerId === undefined) {
        throw new Error(
          `Scenario "${ns}": no matchmaker "${spec.matchmakerKey}"`,
        );
      }
      const membership = spec.membership ?? "invited";
      const userId =
        spec.userKey === undefined ? undefined : userIds[spec.userKey];
      if (spec.userKey !== undefined && userId === undefined) {
        throw new Error(`Scenario "${ns}": no user "${spec.userKey}"`);
      }
      const email =
        spec.email ??
        (spec.userKey !== undefined
          ? users[spec.userKey].email
          : scenarioEmail(spec.key, ns));

      const candidateId = await ctx.db.insert("candidates", {
        matchmakerId,
        userId,
        name: spec.name,
        email,
        socialHandles: spec.socialHandles ?? [],
        membership,
        membershipChangedAt:
          now - (spec.membershipChangedDaysAgo ?? 0) * DAY_MS,
        leaveReason: membership === "left" ? spec.leaveReason : undefined,
        status: spec.status ?? "active",
      });

      // A real invite: the token is derived from the deployment secret, so
      // the link a spec opens is the one the app would have emailed.
      const wants = spec.invite ?? (membership === "invited" ? "open" : "none");
      let inviteToken: string | null = null;
      if (wants !== "none") {
        const invite = await newInvite(candidateId, now);
        inviteToken = await inviteTokenFor(candidateId, invite.nonce ?? "");
        await ctx.db.patch("candidates", candidateId, {
          invite:
            wants === "expired"
              ? { ...invite, expiresAt: now - 1 }
              : { ...invite, lastSentAt: now },
        });
      }

      const ownerUserId = (await ctx.db.get("matchmakers", matchmakerId))
        ?.ownerUserId;
      if (ownerUserId === undefined) {
        throw new Error(`Scenario "${ns}": matchmaker vanished`);
      }
      const byMatchmaker = {
        type: "user",
        userId: ownerUserId,
        role: "matchmaker",
      } as const;
      await ctx.db.insert("auditEvents", {
        matchmakerId,
        candidateId,
        actor: byMatchmaker,
        action: "candidate.created",
        entityTable: "candidates",
        entityId: candidateId,
        changes: [{ field: "email", after: JSON.stringify(email) }],
      });
      if (inviteToken !== null) {
        await ctx.db.insert("auditEvents", {
          matchmakerId,
          candidateId,
          actor: byMatchmaker,
          action: "invite.created",
          entityTable: "candidates",
          entityId: candidateId,
        });
      }
      // How they got to this membership, as the product would have recorded
      // it: an invitation, then their answer to it.
      const answered: Partial<
        Record<
          typeof membership,
          | "invite.accepted"
          | "invite.declined"
          | "membership.left"
          | "membership.account_deleted"
        >
      > = {
        joined: "invite.accepted",
        declined: "invite.declined",
        left: "membership.left",
        account_deleted: "membership.account_deleted",
      };
      const answer = answered[membership];
      if (answer !== undefined) {
        await ctx.db.insert("auditEvents", {
          matchmakerId,
          candidateId,
          actor: byMatchmaker,
          action: "invite.created",
          entityTable: "candidates",
          entityId: candidateId,
        });
        await ctx.db.insert("auditEvents", {
          matchmakerId,
          candidateId,
          actor:
            userId === undefined
              ? byMatchmaker
              : { type: "user", userId, role: "candidate" },
          action: answer,
          entityTable: "candidates",
          entityId: candidateId,
          reason: membership === "left" ? spec.leaveReason : undefined,
        });
      }

      // Invite emails already recorded as sent, for the limits that count
      // them (three a day). Left to the spec, so a seeded invite is "not
      // emailed yet" unless it asks otherwise.
      for (let i = 0; i < (spec.invitesSentToday ?? 0); i++) {
        await ctx.db.insert("auditEvents", {
          matchmakerId,
          candidateId,
          actor: { type: "system", job: "e2e_seed" },
          action: "invite.sent",
          entityTable: "candidates",
          entityId: candidateId,
        });
      }

      const messages = spec.messages ?? [];
      const conversationId = await ctx.db.insert("conversations", {
        matchmakerId,
        candidateId,
        lastSeq: 0,
        lastPublicSeq: 0,
        lastMessageAt: now - messages.length * MESSAGE_GAP_MS,
        matchmakerLastReadSeq: 0,
        candidateLastReadSeq: 0,
      });
      let lastSeq = 0;
      let lastPublicSeq = 0;
      let lastMessageAt = now - messages.length * MESSAGE_GAP_MS;
      for (const [index, message] of messages.entries()) {
        lastSeq += 1;
        const visibility = message.visibility ?? "everyone";
        if (visibility === "everyone") lastPublicSeq = lastSeq;
        lastMessageAt = now - (messages.length - 1 - index) * MESSAGE_GAP_MS;
        await ctx.db.insert("messages", {
          matchmakerId,
          conversationId,
          seq: lastSeq,
          author: message.author,
          authorUserId:
            message.author === "candidate"
              ? userId
              : message.author === "matchmaker"
                ? ownerUserId
                : undefined,
          visibility,
          source:
            message.source ??
            (message.author === "system" ? "system" : "typed"),
          body: message.body,
          sentAt: lastMessageAt,
        });
      }
      await ctx.db.patch("conversations", conversationId, {
        lastSeq,
        lastPublicSeq,
        lastMessageAt,
        matchmakerLastReadSeq: spec.unreadForMatchmaker === true ? 0 : lastSeq,
        candidateLastReadSeq: 0,
      });

      for (const body of spec.notes ?? []) {
        await ctx.db.insert("notes", {
          matchmakerId,
          candidateId,
          body,
          updatedAt: now,
        });
      }

      candidates[spec.key] = {
        id: candidateId,
        email,
        conversationId,
        inviteToken,
      };
    }

    return { ns, users, matchmakers, candidates };
  },
});
