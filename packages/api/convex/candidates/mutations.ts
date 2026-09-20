import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import { diffFields } from "../audit/rules";
import { openInvite, sendInvite } from "../invites/helpers";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { socialPlatform } from "../schema";
import { normaliseEmail } from "../waitlist/rules";
import { requireCandidateSelf } from "./helpers";
import {
  CANDIDATE_LIMITS,
  candidateEmailError,
  candidateNameError,
  handleError,
  importedHistoryError,
  leaveReasonError,
  normaliseCandidateName,
  normaliseHandles,
  normaliseImportedHistory,
  normaliseLeaveReason,
} from "./rules";

/**
 * Onboards a candidate (prd/phase-1.md §3.1). In one transaction: the
 * candidate row (`invited`, `active`) with an open invite, its conversation,
 * the pasted history as a private message at the start of the thread, and the
 * audit events; the invitation email is scheduled, and the invite's expiry
 * with it.
 *
 * Never looks at `users`: the result is the same whether or not the email
 * belongs to an account, so onboarding can't reveal who is on the platform
 * (§9.1).
 *
 * If this matchmaker already has a candidate with the email (in any
 * membership state), nothing is written and that candidate is returned, so
 * the form can link to them.
 */
export const onboard = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    email: v.string(),
    name: v.optional(v.string()),
    socialHandles: v.array(
      v.object({ platform: socialPlatform, handle: v.string() }),
    ),
    importedHistory: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ kind: v.literal("created"), candidateId: v.id("candidates") }),
    v.object({ kind: v.literal("duplicate"), candidateId: v.id("candidates") }),
  ),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );

    if (args.socialHandles.length > CANDIDATE_LIMITS.socialHandles) {
      throw new ConvexError(
        `Add at most ${CANDIDATE_LIMITS.socialHandles} social handles.`,
      );
    }
    const invalid =
      candidateEmailError(args.email) ??
      candidateNameError(args.name ?? "") ??
      importedHistoryError(args.importedHistory ?? "") ??
      args.socialHandles
        .map(({ platform, handle }) => handleError(platform, handle))
        .find((error) => error !== null) ??
      null;
    if (invalid) throw new ConvexError(invalid);

    const email = normaliseEmail(args.email);
    const existing = await ctx.db
      .query("candidates")
      .withIndex("by_matchmakerId_and_email", (q) =>
        q.eq("matchmakerId", matchmaker._id).eq("email", email),
      )
      .first();
    if (existing !== null) {
      return { kind: "duplicate" as const, candidateId: existing._id };
    }

    const now = Date.now();
    const details = {
      email,
      name: normaliseCandidateName(args.name ?? ""),
      socialHandles: normaliseHandles(args.socialHandles),
    };
    const candidateId = await ctx.db.insert("candidates", {
      matchmakerId: matchmaker._id,
      ...details,
      membership: "invited",
      membershipChangedAt: now,
      status: "active",
    });
    const invite = await openInvite(ctx, candidateId, now);

    const history = normaliseImportedHistory(args.importedHistory ?? "");
    const lastSeq = history === undefined ? 0 : 1;
    const conversationId = await ctx.db.insert("conversations", {
      matchmakerId: matchmaker._id,
      candidateId,
      lastSeq,
      lastPublicSeq: 0,
      lastMessageAt: now,
      // The matchmaker wrote the history, so it's already read.
      matchmakerLastReadSeq: lastSeq,
      candidateLastReadSeq: 0,
    });
    if (history !== undefined) {
      await ctx.db.insert("messages", {
        matchmakerId: matchmaker._id,
        conversationId,
        seq: 1,
        author: "matchmaker",
        authorUserId: user._id,
        visibility: "matchmaker",
        source: "imported",
        body: history,
        sentAt: now,
      });
    }

    const actor = {
      type: "user",
      userId: user._id,
      role: "matchmaker",
    } as const;
    const entity = { table: "candidates", id: candidateId } as const;
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      candidateId,
      actor,
      action: "candidate.created",
      entity,
      changes: diffFields<Partial<typeof details>>({}, details, [
        "email",
        "name",
        "socialHandles",
      ]),
    });
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      candidateId,
      actor,
      action: "invite.created",
      entity,
      changes: [
        { field: "email", after: email },
        { field: "expiresAt", after: invite.expiresAt },
      ],
    });

    const candidate = await ctx.db.get("candidates", candidateId);
    if (candidate === null) throw new Error("Candidate vanished mid-mutation");
    await sendInvite(ctx, {
      candidate,
      invite,
      actor,
      action: "invite.sent",
      now,
    });

    return { kind: "created" as const, candidateId };
  },
});

/**
 * Edits a candidate's details from the panel (prd/phase-1.md §4.1): the
 * matchmaker's own label for them, and their social handles.
 *
 * Their email is not editable here. While they're invited it belongs to the
 * invitation (changing it reissues the link — `invites.changeEmail`), and
 * once they've joined it is the address they accepted with.
 */
export const updateDetails = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    name: v.string(),
    socialHandles: v.array(
      v.object({ platform: socialPlatform, handle: v.string() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);

    if (args.socialHandles.length > CANDIDATE_LIMITS.socialHandles) {
      throw new ConvexError(
        `Add at most ${CANDIDATE_LIMITS.socialHandles} social handles.`,
      );
    }
    const invalid =
      candidateNameError(args.name) ??
      args.socialHandles
        .map(({ platform, handle }) => handleError(platform, handle))
        .find((error) => error !== null) ??
      null;
    if (invalid) throw new ConvexError(invalid);

    const next = {
      name: normaliseCandidateName(args.name),
      socialHandles: normaliseHandles(args.socialHandles),
    };
    const changes = diffFields(candidate, next, ["name", "socialHandles"]);
    if (changes.length === 0) return null;

    await ctx.db.patch("candidates", candidate._id, next);
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      candidateId: candidate._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "candidate.details_changed",
      entity: { table: "candidates", id: candidate._id },
      changes,
    });
    return null;
  },
});

/**
 * The matchmaker's own workflow label (prd §4.1): active, paused or
 * archived. It only affects their list; it never restricts messaging, and the
 * candidate never sees it.
 */
export const setStatus = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    if (candidate.status === args.status) return null;

    await ctx.db.patch("candidates", candidate._id, { status: args.status });
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      candidateId: candidate._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "candidate.status_changed",
      entity: { table: "candidates", id: candidate._id },
      changes: [
        { field: "status", before: candidate.status, after: args.status },
      ],
    });
    return null;
  },
});

/**
 * The candidate leaves this matchmaker (prd/phase-1.md §3.4), with an optional
 * reason. Their side of the relationship ends: the conversation disappears
 * from their home page and every candidate-facing function stops answering for
 * it (`requireCandidateSelf` requires `joined`).
 *
 * Nothing is removed from the matchmaker: the thread, the notes and the trail
 * stay fully readable, and they can re-invite the same record so the history
 * continues in one thread. The accept screen says so before anyone joins
 * (§9.3), and the confirmation says it again before they leave.
 */
export const leave = mutation({
  args: { candidateId: v.id("candidates"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, candidate } = await requireCandidateSelf(
      ctx,
      args.candidateId,
    );
    const raw = args.reason ?? "";
    const invalid = leaveReasonError(raw);
    if (invalid) throw new ConvexError(invalid);
    const reason = normaliseLeaveReason(raw);

    await ctx.db.patch("candidates", candidate._id, {
      membership: "left",
      membershipChangedAt: Date.now(),
      leaveReason: reason,
    });
    await recordAudit(ctx, {
      matchmakerId: candidate.matchmakerId,
      candidateId: candidate._id,
      actor: { type: "user", userId: user._id, role: "candidate" },
      action: "membership.left",
      entity: { table: "candidates", id: candidate._id },
      changes: [{ field: "membership", before: "joined", after: "left" }],
      reason,
    });
    return null;
  },
});
