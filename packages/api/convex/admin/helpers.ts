import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import {
  generateSignInCode,
  SIGN_IN_CODE_TTL_SECONDS,
  SIGN_IN_PROVIDER_ID,
} from "../email/rules";
import { getCurrentUser, requireUser } from "../users/helpers";
import { isAdminEmail } from "./rules";

/**
 * Whether a signed-in user is a platform admin: their verified email is listed
 * in the `PLATFORM_ADMIN_EMAILS` deployment env var.
 */
export function isPlatformAdmin(user: Doc<"users">): boolean {
  return (
    user.emailVerificationTime !== undefined &&
    isAdminEmail(user.email, env.PLATFORM_ADMIN_EMAILS)
  );
}

/**
 * The signed-in platform admin, or throw. Every function in `admin/` starts
 * here: they read across every tenant, so the tenant helpers don't apply.
 */
export async function requirePlatformAdmin(
  ctx: QueryCtx,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!isPlatformAdmin(user)) {
    throw new ConvexError("This account isn't a platform admin.");
  }
  return user;
}

/** The signed-in user and whether they're an admin, or `null` signed out. */
export async function getAdminSession(
  ctx: QueryCtx,
): Promise<{ user: Doc<"users">; isAdmin: boolean } | null> {
  const user = await getCurrentUser(ctx);
  if (user === null) return null;
  return { user, isAdmin: isPlatformAdmin(user) };
}

/** A person-readable label for an account: its name, else its email. */
export function accountLabel(user: Doc<"users"> | null): string | null {
  if (user === null) return null;
  return user.name ?? user.email ?? user._id;
}

/**
 * Issues a sign-in code for `user`, exactly as if they had asked for one on
 * the sign-in page but without emailing it: the code is returned instead.
 *
 * Written straight into Convex Auth's tables, in the shape its email provider
 * verifies (`authVerificationCodes`, keyed by the SHA-256 of the code). Like a
 * requested code it replaces any earlier unused one for the account, and it
 * is spent the same way — `signIn("email-code", { email, code })` — so it must
 * not be followed by a "send me a code" request, which would replace it.
 *
 * A seeded account may have no `authAccounts` row yet (its first sign-in would
 * link one by email), so one is created here, as Convex Auth would.
 */
export async function issueSignInCode(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<{ email: string; code: string; expiresAt: number }> {
  const email = user.email;
  if (
    email === undefined ||
    user.deletedAt !== undefined ||
    user.emailVerificationTime === undefined
  ) {
    throw new ConvexError("This account can't sign in.");
  }

  const existing = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", SIGN_IN_PROVIDER_ID).eq("providerAccountId", email),
    )
    .unique();
  if (existing !== null && existing.userId !== user._id) {
    // The address signs in to a different user; a code would open that one.
    throw new ConvexError("This email signs in to a different account.");
  }
  const accountId =
    existing?._id ??
    (await ctx.db.insert("authAccounts", {
      userId: user._id,
      provider: SIGN_IN_PROVIDER_ID,
      providerAccountId: email,
    }));

  const previous = await ctx.db
    .query("authVerificationCodes")
    .withIndex("accountId", (q) => q.eq("accountId", accountId))
    .unique();
  if (previous !== null) await ctx.db.delete(previous._id);

  const code = generateSignInCode();
  const expiresAt = Date.now() + SIGN_IN_CODE_TTL_SECONDS * 1000;
  await ctx.db.insert("authVerificationCodes", {
    accountId,
    provider: SIGN_IN_PROVIDER_ID,
    code: await sha256Hex(code),
    expirationTime: expiresAt,
    emailVerified: email,
  });
  return { email, code, expiresAt };
}

/** Lowercase hex SHA-256, as Convex Auth hashes verification codes. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
