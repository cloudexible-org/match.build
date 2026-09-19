import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import { normaliseEmail } from "../waitlist/rules";

/**
 * The signed-in user, or `null` when signed out or the account was deleted.
 * For queries that should render nothing rather than fail while auth settles.
 */
export async function getCurrentUser(
  ctx: QueryCtx,
): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get("users", userId);
  if (user === null || user.deletedAt !== undefined) return null;
  return user;
}

/**
 * The signed-in, non-deleted user, or throw. Every function that acts on
 * behalf of a person starts here (prd/phase-1.md §9.2).
 */
export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user === null) throw new ConvexError("You need to sign in.");
  return user;
}

/** The profile Convex Auth hands `createOrUpdateUser` for our email provider. */
export type AuthUserArgs = {
  existingUserId: Id<"users"> | null;
  type: "oauth" | "credentials" | "email" | "phone" | "verification";
  profile: { email?: string; emailVerified?: boolean };
};

/**
 * Convex Auth's `createOrUpdateUser` callback, replacing its default so that a
 * deleted account is never reused (prd/phase-1.md §3.5).
 *
 * Convex Auth calls this twice per sign-in: once when a code is requested
 * (`type: "email"`, email not yet proven) and once when the code is verified
 * (`type: "verification"`, `emailVerified: true`). So a `users` row can exist
 * for an address nobody has proven yet; it only gets `emailVerificationTime`
 * — and can only be signed into — after verification.
 *
 * One account per email: an unlinked sign-in attaches to the existing
 * non-deleted user with that address, and only creates a user when there is
 * none. Account deletion removes the account's `authAccounts` rows, so the
 * next sign-in with that address arrives here with `existingUserId: null` and
 * gets a fresh user.
 */
export async function upsertAuthUser(
  ctx: MutationCtx,
  args: AuthUserArgs,
): Promise<Id<"users">> {
  const email =
    args.profile.email === undefined
      ? undefined
      : normaliseEmail(args.profile.email);
  const verified = args.type === "verification" && args.profile.emailVerified;

  let user: Doc<"users"> | null = null;
  if (args.existingUserId !== null) {
    const existing = await ctx.db.get("users", args.existingUserId);
    if (existing !== null && existing.deletedAt === undefined) user = existing;
  }
  if (user === null && email !== undefined) {
    user = await findLiveUserByEmail(ctx, email);
  }

  if (user === null) {
    const userId = await ctx.db.insert("users", { email });
    if (verified) await markVerified(ctx, userId);
    return userId;
  }

  if (verified && user.emailVerificationTime === undefined) {
    await markVerified(ctx, user._id);
  }
  return user._id;
}

/** First verification is when the account comes into existence for the user. */
async function markVerified(ctx: MutationCtx, userId: Id<"users">) {
  await ctx.db.patch("users", userId, { emailVerificationTime: Date.now() });
  await recordAudit(ctx, {
    actor: { type: "user", userId, role: "account" },
    action: "account.created",
    entity: { table: "users", id: userId },
  });
}

/** The non-deleted user with this (normalised) email, if any. */
export async function findLiveUserByEmail(
  ctx: QueryCtx,
  email: string,
): Promise<Doc<"users"> | null> {
  const users = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(20);
  return users.find((user) => user.deletedAt === undefined) ?? null;
}
