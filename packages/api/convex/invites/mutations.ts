import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "../_generated/server";
import { type AuditActor, recordAudit } from "../audit/helpers";
import { candidateEmailError } from "../candidates/rules";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { notifyMatchmakerOfMembership } from "../notifications/helpers";
import { requireUser } from "../users/helpers";
import { normaliseEmail } from "../waitlist/rules";
import {
  assertCanSendInvite,
  INVITE_PROBLEM_MESSAGES,
  type InviteRef,
  inviteProblem,
  openInvite,
  resolveInvite,
  scheduleExpiry,
  sendInvite,
} from "./helpers";

/*
 * Invitations (prd/phase-1.md §3.2). One open invite per candidate, stored on
 * the candidate row; every step is audited in the same mutation.
 *
 * The person's side — accept, decline — takes the invite link's `token` or,
 * from the home page, the `candidateId` of an invite to their verified email.
 * The matchmaker's side — resend, revoke, change email, re-invite — takes
 * the workspace and the candidate.
 */

const inviteRef = {
  token: v.optional(v.string()),
  candidateId: v.optional(v.string()),
};

const INVALID = "This invitation isn't valid any more.";

async function openInviteFor(
  ctx: MutationCtx,
  ref: InviteRef,
  now: number,
): Promise<{ user: Doc<"users">; candidate: Doc<"candidates"> }> {
  const user = await requireUser(ctx);
  const candidate = await resolveInvite(ctx, user, ref);
  // The expiry job clears an invite at `expiresAt`; this closes the gap
  // before it runs.
  if (candidate === null || (candidate.invite?.expiresAt ?? 0) <= now) {
    throw new ConvexError(INVALID);
  }
  return { user, candidate };
}

/**
 * Accepts an invite: links the candidate record to this account, makes it
 * `joined`, and clears the invite so the link stops working. Refused, with
 * the invite left open, when `inviteProblem` finds a reason.
 */
export const accept = mutation({
  args: inviteRef,
  returns: v.object({ matchmakerUsername: v.string() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { user, candidate } = await openInviteFor(ctx, args, now);
    const problem = await inviteProblem(ctx, user, candidate);
    if (problem !== null) {
      throw new ConvexError(INVITE_PROBLEM_MESSAGES[problem]);
    }
    const matchmaker = await ctx.db.get("matchmakers", candidate.matchmakerId);
    if (matchmaker === null) throw new ConvexError(INVALID);

    await ctx.db.patch("candidates", candidate._id, {
      userId: user._id,
      membership: "joined",
      membershipChangedAt: now,
      invite: undefined,
    });
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor: { type: "user", userId: user._id, role: "candidate" },
      action: "invite.accepted",
      entity: { table: "candidates", id: candidate._id },
      changes: [
        { field: "membership", before: "invited", after: "joined" },
        // Who accepted: the link works for any account, so this may differ
        // from the invited address.
        { field: "acceptedAs", after: user.email },
      ],
      relatedEntityId: user._id,
    });
    // The matchmaker has been waiting for this one (prd/phase-1.md §8.1).
    await notifyMatchmakerOfMembership(ctx, {
      candidateId: candidate._id,
      event: "accepted",
    });
    return { matchmakerUsername: matchmaker.username };
  },
});

/**
 * Declines an invite: clears it and marks the candidate `declined`. The
 * record stays in the matchmaker's book so they can follow up and re-invite.
 * The account isn't linked.
 */
export const decline = mutation({
  args: inviteRef,
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { user, candidate } = await openInviteFor(ctx, args, now);
    // A matchmaker opening their own candidate's link mustn't decline it.
    if ((await inviteProblem(ctx, user, candidate)) === "own_profile") {
      throw new ConvexError(INVITE_PROBLEM_MESSAGES.own_profile);
    }
    await ctx.db.patch("candidates", candidate._id, {
      membership: "declined",
      membershipChangedAt: now,
      invite: undefined,
    });
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor: { type: "user", userId: user._id, role: "candidate" },
      action: "invite.declined",
      entity: { table: "candidates", id: candidate._id },
      changes: [{ field: "membership", before: "invited", after: "declined" }],
    });
    return null;
  },
});

const workspaceCandidate = {
  matchmakerId: v.id("matchmakers"),
  candidateId: v.id("candidates"),
};

async function requireWorkspaceCandidate(
  ctx: MutationCtx,
  args: {
    matchmakerId: Doc<"matchmakers">["_id"];
    candidateId: Doc<"candidates">["_id"];
  },
): Promise<{ actor: AuditActor; candidate: Doc<"candidates"> }> {
  const { user, matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
  const candidate = await ctx.db.get("candidates", args.candidateId);
  assertSameTenant(candidate, matchmaker._id);
  return {
    actor: { type: "user", userId: user._id, role: "matchmaker" },
    candidate,
  };
}

/** Emails the open invite again, at most three times a day. */
export const resend = mutation({
  args: workspaceCandidate,
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { actor, candidate } = await requireWorkspaceCandidate(ctx, args);
    if (candidate.invite === undefined) {
      throw new ConvexError("There's no open invitation to resend.");
    }
    await assertCanSendInvite(ctx, candidate._id, now);
    await sendInvite(ctx, {
      candidate,
      invite: candidate.invite,
      actor,
      action: "invite.resent",
      now,
    });
    return null;
  },
});

/** Revokes the open invite: its link stops working at once. */
export const revoke = mutation({
  args: workspaceCandidate,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, candidate } = await requireWorkspaceCandidate(ctx, args);
    if (candidate.invite === undefined) {
      throw new ConvexError("There's no open invitation to revoke.");
    }
    await ctx.db.patch("candidates", candidate._id, { invite: undefined });
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor,
      action: "invite.revoked",
      entity: { table: "candidates", id: candidate._id },
    });
    return null;
  },
});

/**
 * Changes an invited candidate's email and sends a fresh invite there. The
 * new invite has a new token, which replaces the old one and so kills the
 * old link. An email already in the book returns that candidate instead.
 */
export const changeEmail = mutation({
  args: { ...workspaceCandidate, email: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("changed") }),
    v.object({ kind: v.literal("duplicate"), candidateId: v.id("candidates") }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { actor, candidate } = await requireWorkspaceCandidate(ctx, args);
    if (candidate.membership !== "invited") {
      throw new ConvexError(
        "Only an invited candidate's email can be changed here.",
      );
    }
    const invalid = candidateEmailError(args.email);
    if (invalid) throw new ConvexError(invalid);
    const email = normaliseEmail(args.email);
    if (email === candidate.email) {
      throw new ConvexError("That's already the email they're invited at.");
    }
    const existing = await ctx.db
      .query("candidates")
      .withIndex("by_matchmakerId_and_email", (q) =>
        q.eq("matchmakerId", candidate.matchmakerId).eq("email", email),
      )
      .first();
    if (existing !== null) {
      return { kind: "duplicate" as const, candidateId: existing._id };
    }
    await assertCanSendInvite(ctx, candidate._id, now);

    await ctx.db.patch("candidates", candidate._id, { email });
    const invite = await openInvite(ctx, candidate._id, now);
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor,
      action: "invite.email_changed",
      entity: { table: "candidates", id: candidate._id },
      changes: [{ field: "email", before: candidate.email, after: email }],
    });
    await sendInvite(ctx, {
      candidate: { ...candidate, email },
      invite,
      actor,
      action: "invite.sent",
      now,
    });
    return { kind: "changed" as const };
  },
});

/**
 * Opens and emails a new invite: for a candidate who declined, left or
 * deleted their account (`membership.reinvited`, back to `invited`), or an
 * invited one whose invite was revoked or expired.
 */
export const reinvite = mutation({
  args: workspaceCandidate,
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { actor, candidate } = await requireWorkspaceCandidate(ctx, args);
    if (candidate.membership === "joined") {
      throw new ConvexError("They're already a member.");
    }
    if (candidate.invite !== undefined) {
      throw new ConvexError("Their invitation is still open.");
    }
    await assertCanSendInvite(ctx, candidate._id, now);

    const entity = { table: "candidates", id: candidate._id } as const;
    if (candidate.membership !== "invited") {
      await ctx.db.patch("candidates", candidate._id, {
        membership: "invited",
        membershipChangedAt: now,
      });
      await recordAudit(ctx, {
        matchmakerId: candidate.matchmakerId,
        candidateId: candidate._id,
        actor,
        action: "membership.reinvited",
        entity,
        changes: [
          {
            field: "membership",
            before: candidate.membership,
            after: "invited",
          },
        ],
      });
    }
    const invite = await openInvite(ctx, candidate._id, now);
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor,
      action: "invite.created",
      entity,
      changes: [
        { field: "email", after: candidate.email },
        { field: "expiresAt", after: invite.expiresAt },
      ],
    });
    await sendInvite(ctx, {
      candidate,
      invite,
      actor,
      action: "invite.sent",
      now,
    });
    return null;
  },
});

/**
 * Scheduled for each invite's `expiresAt` by `openInvite` (in hops, see
 * `scheduleExpiry`). Clears the invite only if it's still the one it was
 * scheduled for; a revoked, answered or reissued invite leaves nothing to do.
 */
export const expire = internalMutation({
  args: { candidateId: v.id("candidates"), tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get("candidates", args.candidateId);
    const invite = candidate?.invite;
    if (candidate === null || invite?.tokenHash !== args.tokenHash) {
      return null;
    }
    const now = Date.now();
    if (now < invite.expiresAt) {
      await scheduleExpiry(ctx, candidate._id, invite, now);
      return null;
    }
    await ctx.db.patch("candidates", candidate._id, { invite: undefined });
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor: { type: "system", job: "invite_expiry" },
      action: "invite.expired",
      entity: { table: "candidates", id: candidate._id },
    });
    return null;
  },
});
