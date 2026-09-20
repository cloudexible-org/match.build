import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import {
  ACCOUNT_DELETION_CODE_TTL_SECONDS,
  generateSignInCode,
} from "../email/rules";
import { notifyMatchmakerOfMembership } from "../notifications/helpers";
import {
  assertCanDeleteAccount,
  removeSignInCredentials,
  requireUser,
  sha256Hex,
} from "./helpers";
import {
  ACCOUNT_DELETION_MAX_ATTEMPTS,
  accountNameError,
  normaliseName,
} from "./rules";

// Far above anyone's real number of matchmakers; bounds the fan-out below.
const MAX_MEMBERSHIPS = 100;

/**
 * Sets the account's name — first at sign-up, then from settings.
 *
 * Audited as `account.name_changed` at account level, and once more in the
 * trail of each matchmaker the person has joined, since those matchmakers see
 * this name. Each copy lives only in its own matchmaker's trail, so no
 * matchmaker learns who else the person is with.
 */
export const setName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const error = accountNameError(args.name);
    if (error) throw new ConvexError(error);

    const user = await requireUser(ctx);
    const name = normaliseName(args.name);
    if (name === user.name) return null;

    await ctx.db.patch("users", user._id, { name });

    const change = { field: "name", before: user.name, after: name };
    const entity = { table: "users", id: user._id } as const;
    await recordAudit(ctx, {
      actor: { type: "user", userId: user._id, role: "account" },
      action: "account.name_changed",
      entity,
      changes: [change],
    });

    const memberships = await ctx.db
      .query("candidates")
      .withIndex("by_userId_and_matchmakerId", (q) => q.eq("userId", user._id))
      .take(MAX_MEMBERSHIPS);
    for (const candidate of memberships) {
      if (candidate.membership !== "joined") continue;
      await recordAudit(ctx, {
        matchmakerId: candidate.matchmakerId,
        candidateId: candidate._id,
        actor: { type: "user", userId: user._id, role: "candidate" },
        action: "account.name_changed",
        entity,
        changes: [change],
      });
    }
    return null;
  },
});

/**
 * Starts deleting the account (prd/phase-1.md §3.5): issues a fresh six-digit
 * code, keeps only its hash, and emails it. Asking again replaces the previous
 * code, so only the newest one works.
 *
 * Refused for an account that owns a matchmaker profile, before anything is
 * written or sent.
 *
 * The code goes to the mailing action as an argument rather than being read
 * back from the database, because only its hash is stored. A scheduled
 * function's arguments hold it for the moment it takes to send: acceptable for
 * a ten-minute code that can only confirm a deletion the signed-in account
 * asked for, and the alternative is keeping it in plain text in a row.
 */
export const requestDeletionCode = mutation({
  args: {},
  returns: v.object({ email: v.string(), expiresAt: v.number() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await assertCanDeleteAccount(ctx, user);
    const email = user.email;
    if (email === undefined) throw new ConvexError("Add an email first.");

    const code = generateSignInCode();
    const expiresAt = Date.now() + ACCOUNT_DELETION_CODE_TTL_SECONDS * 1000;
    await ctx.db.patch("users", user._id, {
      deletionCode: { codeHash: await sha256Hex(code), expiresAt, attempts: 0 },
    });
    await ctx.scheduler.runAfter(0, internal.users.actions.sendDeletionCode, {
      to: email,
      code,
    });
    return { email, expiresAt };
  },
});

/**
 * Deletes the account, once the emailed code is entered (prd/phase-1.md §3.5).
 *
 * In one transaction:
 *
 * - every candidate record linked to the account becomes `account_deleted`,
 *   with its own audit event in that matchmaker's trail only — so no
 *   matchmaker learns which others the person was with (§9.1). Any open invite
 *   is cleared with it: it was issued to an account that no longer exists, and
 *   the matchmaker can re-invite;
 * - the `users` row is marked `deletedAt` and keeps everything else, so
 *   matchmakers still see who the person was in their own records;
 * - the account's sessions and sign-in credentials are removed, so it can
 *   never be signed into again. Signing up with the same address afterwards
 *   creates a new account, which sees none of this.
 *
 * A wrong or expired code is **returned** as `refused`, not thrown: a throwing
 * mutation rolls its own writes back, and the count of wrong guesses has to
 * survive the refusal that caused it. Not being allowed to delete this account
 * at all still throws.
 */
export const deleteAccount = mutation({
  args: { code: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("deleted") }),
    v.object({ kind: v.literal("refused"), message: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertCanDeleteAccount(ctx, user);

    const now = Date.now();
    const expired = {
      kind: "refused" as const,
      message: "That code has expired. Start again to get a new one.",
    };
    const pending = user.deletionCode;
    if (pending === undefined || pending.expiresAt <= now) return expired;

    if ((await sha256Hex(args.code.trim())) !== pending.codeHash) {
      const attempts = pending.attempts + 1;
      const spent = attempts >= ACCOUNT_DELETION_MAX_ATTEMPTS;
      // A guessed-at code is thrown away rather than left to be guessed at.
      await ctx.db.patch("users", user._id, {
        deletionCode: spent ? undefined : { ...pending, attempts },
      });
      return {
        kind: "refused" as const,
        message: spent
          ? "Too many wrong codes. Start again to get a new one."
          : "That code didn't work. Check it, or start again.",
      };
    }

    const memberships = await ctx.db
      .query("candidates")
      .withIndex("by_userId_and_matchmakerId", (q) => q.eq("userId", user._id))
      .take(MAX_MEMBERSHIPS);
    for (const candidate of memberships) {
      if (candidate.membership === "account_deleted") continue;
      await ctx.db.patch("candidates", candidate._id, {
        membership: "account_deleted",
        membershipChangedAt: now,
        invite: undefined,
      });
      await recordAudit(ctx, {
        matchmakerId: candidate.matchmakerId,
        candidateId: candidate._id,
        actor: { type: "user", userId: user._id, role: "candidate" },
        action: "membership.account_deleted",
        entity: { table: "candidates", id: candidate._id },
        changes: [
          {
            field: "membership",
            before: candidate.membership,
            after: "account_deleted",
          },
        ],
      });
      // One notice per matchmaker, each knowing only about their own record.
      await notifyMatchmakerOfMembership(ctx, {
        candidateId: candidate._id,
        event: "account_deleted",
      });
    }

    await ctx.db.patch("users", user._id, {
      deletedAt: now,
      deletionCode: undefined,
    });
    await recordAudit(ctx, {
      actor: { type: "user", userId: user._id, role: "account" },
      action: "account.deleted",
      entity: { table: "users", id: user._id },
    });
    await removeSignInCredentials(ctx, user._id);
    return { kind: "deleted" as const };
  },
});
