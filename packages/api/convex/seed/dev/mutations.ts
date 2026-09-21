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
import { runMatchPass } from "../../matches/helpers";
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
 * A `DevProfile` merged into whatever is already on the record.
 *
 * **Additive one entry at a time, not one row at a time.** These people are
 * seeded long before anyone clicks on them, so by the time a new proposal is
 * added here they already have a profile — and a guard that skipped the whole
 * row when one existed would never write another proposal again. What is
 * missing is the proposal, so that is what gets added.
 *
 * So: an entry that is already there keeps its value, its source and its
 * timestamp untouched, and only gains a `pending` if it has none. An entry
 * that is not there is created. Nothing is ever overwritten — which also means
 * a proposal you have already answered comes back on the next seed, because
 * from here that is indistinguishable from one that was never written.
 *
 * A proposal is written straight onto the entry rather than through
 * `applyAgentEntries`, because that path decides between writing and
 * suggesting from the field's policy — and what dev needs is an open proposal
 * on each of these fields whatever their policy says.
 */
function mergeProfile(
  profile: DevProfile,
  current: { facts: ProfileEntries; notes: ProfileEntries },
  now: number,
): { facts: ProfileEntries; notes: ProfileEntries; added: number } {
  const maps = {
    facts: { ...current.facts },
    notes: { ...current.notes },
  };
  let added = 0;

  for (const kind of ["facts", "notes"] as const) {
    for (const [key, value] of Object.entries(profile[kind] ?? {})) {
      if (maps[kind][key] !== undefined) continue; // theirs, not ours
      maps[kind][key] = { value, source: "matchmaker", updatedAt: now };
      added += 1;
    }
  }

  for (const suggestion of profile.suggestions ?? []) {
    const existing = maps[suggestion.kind][suggestion.key];
    if (existing?.pending !== undefined) continue; // one is already open
    maps[suggestion.kind][suggestion.key] = {
      // A proposal sits beside the value, never instead of it — and where
      // there is a real value already, it is the one worth proposing against.
      value: existing?.value ?? suggestion.current ?? "",
      source: existing?.source ?? "agent",
      updatedAt: existing?.updatedAt ?? now,
      model: existing?.model,
      sourceQuote: existing?.sourceQuote,
      pending: {
        action: suggestion.remove === true ? "clear" : "set",
        value: suggestion.remove === true ? "" : suggestion.value,
        suggestedAt: now,
        model: "seed/model",
        sourceQuote: suggestion.quote,
      },
    };
    added += 1;
  }

  return { ...maps, added };
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

      // Drafted replies, on the same rule as a profile entry: added where
      // there are none, and never on top of drafts already waiting.
      if (member.replyDrafts !== undefined) {
        const conversation = await ctx.db
          .query("conversations")
          .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
          .unique();
        if (conversation !== null) {
          const open = await ctx.db
            .query("replySuggestions")
            .withIndex("by_conversationId_and_status", (q) =>
              q.eq("conversationId", conversation._id).eq("status", "ready"),
            )
            .first();
          if (open === null) {
            for (const [index, body] of member.replyDrafts.entries()) {
              await ctx.db.insert("replySuggestions", {
                matchmakerId,
                candidateId,
                conversationId: conversation._id,
                body,
                model: "seed/model",
                throughSeq: conversation.lastSeq,
                status: "ready",
                // A millisecond apart, so "newest first" is a total order.
                createdAt: now + index,
              });
            }
            created.push(
              `${member.replyDrafts.length} drafted replies for ${user.email}`,
            );
          }
        }
      }

      if (member.profile !== undefined) {
        const seeded = await ctx.db
          .query("candidateProfiles")
          .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
          .unique();
        const { facts, notes, added } = mergeProfile(
          member.profile,
          { facts: seeded?.facts ?? {}, notes: seeded?.notes ?? {} },
          now,
        );
        if (seeded === null) {
          await ctx.db.insert("candidateProfiles", {
            matchmakerId,
            candidateId,
            facts,
            notes,
            updatedAt: now,
          });
          created.push(`profile for ${user.email}`);
        } else if (added > 0) {
          await ctx.db.patch("candidateProfiles", seeded._id, {
            facts,
            notes,
            updatedAt: now,
          });
          created.push(`${added} entries on the profile for ${user.email}`);
        }
      }
    }

    // Their voice, and the draft waiting on it. Same rule as a candidate's
    // entries: whatever they have written stays, and the draft is added only
    // where there isn't one.
    const mineSeeded = await ctx.db
      .query("matchmakerProfiles")
      .withIndex("by_matchmakerId", (q) => q.eq("matchmakerId", matchmakerId))
      .unique();
    if (mineSeeded?.voice?.pending === undefined) {
      const voice = {
        value: mineSeeded?.voice?.value ?? DEV_MATCHMAKER.voice,
        source: mineSeeded?.voice?.source ?? ("matchmaker" as const),
        updatedAt: mineSeeded?.voice?.updatedAt ?? now,
        pending: {
          action: "set" as const,
          value: DEV_MATCHMAKER.voiceSuggestion,
          suggestedAt: now,
          model: "seed/model",
        },
      };
      if (mineSeeded === null) {
        await ctx.db.insert("matchmakerProfiles", {
          matchmakerId,
          voice,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch("matchmakerProfiles", mineSeeded._id, {
          voice,
          updatedAt: now,
        });
      }
      created.push(`voice draft for ${DEV_MATCHMAKER.username}`);
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

    // The match board (prd/phase-3.md §2). It runs the real algorithm rather
    // than writing cards by hand: a seeded board the nightly run could never
    // have produced is one you can't learn anything from.
    //
    // Only when the board is empty, so a re-run doesn't undo an afternoon of
    // moving cards around.
    const anyMatch = await ctx.db
      .query("matches")
      .withIndex("by_matchmakerId", (q) => q.eq("matchmakerId", matchmakerId))
      .first();
    if (anyMatch === null) {
      const report = await runMatchPass(ctx, matchmakerId, {
        type: "system",
        job: "seed",
      });
      created.push(`${report.created} suggested matches`);

      // Three of them moved along, so the board is a board rather than one
      // full column beside four empty ones.
      const suggested = await ctx.db
        .query("matches")
        .withIndex("by_matchmakerId_and_stage", (q) =>
          q.eq("matchmakerId", matchmakerId).eq("stage", "suggested"),
        )
        .order("desc")
        .take(3);
      const [reviewing, introduced, turnedDown] = suggested;
      if (reviewing !== undefined) {
        await ctx.db.patch("matches", reviewing._id, {
          stage: "reviewing",
          stageChangedAt: now,
          updatedAt: now,
        });
      }
      if (introduced !== undefined) {
        await ctx.db.patch("matches", introduced._id, {
          stage: "introduced",
          stageChangedAt: now,
          // One yes and one answer still missing: the sub-state neither of the
          // columns either side of it can show.
          candidateAResponse: "yes",
          candidateBResponse: "pending",
          updatedAt: now,
        });
      }
      if (turnedDown !== undefined) {
        await ctx.db.patch("matches", turnedDown._id, {
          stage: "rejected",
          stageChangedAt: now,
          rejectedBy: "candidateB",
          rejectionReason: "Not ready to meet anyone until the spring.",
          updatedAt: now,
        });
      }
    }

    const accounts = DEV_USERS.map(({ email, role }) => ({ email, role }));

    return { created, accounts };
  },
});
