import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import { sendSignInCode } from "./email/helpers";
import {
  generateSignInCode,
  SIGN_IN_CODE_TTL_SECONDS,
  SIGN_IN_PROVIDER_ID,
} from "./email/rules";
import { upsertAuthUser } from "./users/helpers";

/**
 * Convex Auth (prd/phase-1.md §8.4): sign-in and sign-up are the same flow —
 * enter an email, then the six-digit code sent to it. A code, not a magic
 * link, because a link opened from a mail app often lands in a different
 * browser than an installed home-screen app.
 *
 * This file stays at the convex/ root (an exception to the domain layout in
 * CLAUDE.md §8): Convex Auth's client calls its functions as `auth:signIn`.
 *
 * Deployment env: JWT_PRIVATE_KEY, JWKS and SITE_URL (see
 * `packages/api/scripts/auth-keys.mjs`), plus RESEND_API_KEY to send real
 * email.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Email({
      id: SIGN_IN_PROVIDER_ID,
      maxAge: SIGN_IN_CODE_TTL_SECONDS,
      generateVerificationToken: async () => generateSignInCode(),
      // Convex Auth passes the action ctx as a second argument, which its
      // provider typings do not declare.
      sendVerificationRequest: async ({ identifier, token }, ...rest) => {
        const [ctx] = rest as unknown as [Parameters<typeof sendSignInCode>[0]];
        await sendSignInCode(ctx, identifier, token);
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // Convex Auth types ctx over an untyped data model; it is this app's.
      return await upsertAuthUser(ctx as unknown as MutationCtx, {
        existingUserId: args.existingUserId,
        type: args.type,
        profile: args.profile,
      });
    },
  },
});
