/**
 * Generates this deployment's VAPID keys — the identity a push service knows
 * us by (prd/phase-1.md §8.2, convex/notifications/helpers.ts) — and sets
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT on the deployment the
 * Convex CLI resolves (your dev deployment, from packages/api/.env.local), or
 * on prod.
 *
 *   pnpm --filter @repo/api push:setup
 *   pnpm --filter @repo/api push:setup --prod
 *   pnpm --filter @repo/api push:setup --subject mailto:you@example.com
 *
 * Refuses to replace existing keys unless you pass --force: rotating them
 * silently breaks every push subscription already in the database, and the
 * browsers only find out when they next re-subscribe.
 *
 * Without these keys the app offers email notifications only, which is the
 * right state for a deployment that isn't ready to send push.
 */

import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

const args = process.argv.slice(2);
const target = args.includes("--prod") ? ["--prod"] : [];
const subjectFlag = args.indexOf("--subject");
const subject = subjectFlag === -1 ? undefined : args[subjectFlag + 1];

function convex(commandArgs, input) {
  return spawnSync("npx", ["convex", ...commandArgs, ...target], {
    input,
    encoding: "utf-8",
    stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
  });
}

const existing = convex(["env", "get", "VAPID_PUBLIC_KEY"]);
if (
  existing.status === 0 &&
  existing.stdout.trim() &&
  !args.includes("--force")
) {
  console.error(
    "VAPID keys are already set on this deployment. Re-run with --force to rotate them (every existing push subscription stops working).",
  );
  process.exit(1);
}

// The format every web-push tool uses: the public key as the uncompressed
// P-256 point (0x04 || x || y) and the private key as the bare 32-byte scalar,
// both base64url. `notifications/helpers.ts` reassembles the JWK from them.
const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const point = Buffer.concat([
  Buffer.of(4),
  Buffer.from(pub.x, "base64url"),
  Buffer.from(pub.y, "base64url"),
]);

const values = {
  VAPID_PUBLIC_KEY: point.toString("base64url"),
  VAPID_PRIVATE_KEY: priv.d,
};
if (subject !== undefined) values.VAPID_SUBJECT = subject;

for (const [name, value] of Object.entries(values)) {
  const result = convex(["env", "set", name], value);
  if (result.status !== 0) {
    console.error(`Failed to set ${name}:\n${result.stderr}`);
    process.exit(1);
  }
  console.log(`✔ ${name}`);
}
if (subject === undefined) {
  console.log(
    "VAPID_SUBJECT not set — SITE_URL is used instead. Pass --subject mailto:you@example.com to give push services a contact address.",
  );
}
