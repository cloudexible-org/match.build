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

/*
 * ─── Deleting an account (prd/phase-1.md §3.5) ──────────────────────────────
 */

/** Lowercase hex SHA-256. Deletion codes are stored hashed, never in plain. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Throws unless this account may be deleted from the UI.
 *
 * An account that owns a matchmaker profile can't be: candidates, notes and
 * conversations hang off that profile, and closing one is its own feature
 * (see the backlog). A verified email is also required — it is where the
 * confirmation code goes.
 */
export async function assertCanDeleteAccount(
  ctx: QueryCtx,
  user: Doc<"users">,
): Promise<void> {
  if (user.email === undefined || user.emailVerificationTime === undefined) {
    throw new ConvexError("Verify your email address first.");
  }
  const owned = await ctx.db
    .query("matchmakers")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
    .first();
  if (owned !== null) {
    throw new ConvexError(
      "This account has a matchmaker profile, so it can't be deleted here. Get in touch and we'll help.",
    );
  }
}

/**
 * How many rows of each auth table one account can plausibly have: a session
 * per device, a refresh token per session. Far above anyone real, and it keeps
 * the deletion inside one transaction.
 */
const MAX_AUTH_ROWS = 200;

/**
 * Removes everything that lets this account sign in: its sessions (and their
 * refresh tokens) and its `authAccounts` rows (and any unused verification
 * code). The `users` row itself stays, marked `deletedAt`.
 *
 * This is the one place in the product that hard-deletes (prd §6): auth
 * plumbing is not a record of anything, and leaving it behind would leave the
 * account signable-in.
 */
export async function removeSignInCredentials(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .take(MAX_AUTH_ROWS);
  for (const session of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .take(MAX_AUTH_ROWS);
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(session._id);
  }

  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .take(MAX_AUTH_ROWS);
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .take(MAX_AUTH_ROWS);
    for (const code of codes) await ctx.db.delete(code._id);
    await ctx.db.delete(account._id);
  }
}
