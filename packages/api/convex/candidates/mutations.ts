import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import { diffFields } from "../audit/rules";
import { openInvite, sendInvite } from "../invites/helpers";
import { requireMatchmaker } from "../matchmakers/helpers";
import { socialPlatform } from "../schema";
import { normaliseEmail } from "../waitlist/rules";
import {
  CANDIDATE_LIMITS,
  candidateEmailError,
  candidateNameError,
  handleError,
  importedHistoryError,
  normaliseCandidateName,
  normaliseHandles,
  normaliseImportedHistory,
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
