import { generateKeyPairSync, randomBytes } from "node:crypto";
import { SEED_ADMINS } from "../../packages/api/convex/seed/e2e/fixture";
import { setBackendEnv } from "./admin-client";

/**
 * Gives the local backend what Convex Auth needs to issue sessions: a fresh
 * RS256 signing key (`JWT_PRIVATE_KEY`), its public half (`JWKS`), and the
 * app's URL (`SITE_URL`). Also a fresh `INVITE_LINK_SECRET`, which invite
 * links are derived from (`convex/invites/helpers.ts`), and the seeded
 * platform admins (`PLATFORM_ADMIN_EMAILS`, `convex/admin/helpers.ts`).
 *
 * Regenerated every run. The previous run's sessions die with the old key,
 * which is what we want — the seed wipes their users anyway.
 *
 * `RESEND_API_KEY` is deliberately never set here, so sign-in codes land in
 * the backend's internal `emailOutbox` table (see `sign-in-codes.ts`) and no
 * email is ever sent from a test run.
 */
export async function configureAuthEnv(siteUrl: string): Promise<void> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: "jwk" });

  await setBackendEnv({
    JWT_PRIVATE_KEY: privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
    JWKS: JSON.stringify({ keys: [{ use: "sig", alg: "RS256", ...jwk }] }),
    SITE_URL: siteUrl,
    INVITE_LINK_SECRET: randomBytes(32).toString("base64url"),
    PLATFORM_ADMIN_EMAILS: SEED_ADMINS.map((admin) => admin.email).join(","),
  });
}
