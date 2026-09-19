/**
 * One-time Convex Auth setup for a deployment: generates an RS256 key pair and
 * sets JWT_PRIVATE_KEY, JWKS and SITE_URL on the deployment the Convex CLI
 * resolves (your dev deployment, from packages/api/.env.local).
 *
 *   pnpm --filter @repo/api auth:setup --site-url https://<deployment>.convex.site/app
 *   pnpm --filter @repo/api auth:setup --site-url https://… --prod
 *
 * Refuses to replace existing keys unless you pass --force: rotating the key
 * signs every user out.
 *
 * The e2e suite does NOT use this — it sets fresh keys on its own local
 * backend every run (apps/e2e/auth-env.ts).
 */

import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const siteUrl = option("--site-url");
if (!siteUrl) {
  console.error(
    "Usage: auth:setup --site-url <the app's URL, e.g. https://<deployment>.convex.site/app> [--prod] [--force]",
  );
  process.exit(1);
}
const target = flag("--prod") ? ["--prod"] : [];

function convex(commandArgs, input) {
  return spawnSync("npx", ["convex", ...commandArgs, ...target], {
    input,
    encoding: "utf-8",
    stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
  });
}

const existing = convex(["env", "get", "JWT_PRIVATE_KEY"]);
if (existing.status === 0 && existing.stdout.trim() && !flag("--force")) {
  console.error(
    "JWT_PRIVATE_KEY is already set on this deployment. Re-run with --force to rotate it (this signs everyone out).",
  );
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const vars = {
  JWT_PRIVATE_KEY: privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString()
    .trimEnd(),
  JWKS: JSON.stringify({
    keys: [
      { use: "sig", alg: "RS256", ...publicKey.export({ format: "jwk" }) },
    ],
  }),
  SITE_URL: siteUrl,
};

for (const [name, value] of Object.entries(vars)) {
  // The value goes over stdin: a PEM key starts with dashes, which the CLI
  // would otherwise try to parse as flags.
  const result = convex(["env", "set", name], value);
  if (result.status !== 0) {
    console.error(`Failed to set ${name}:\n${result.stderr}`);
    process.exit(1);
  }
  console.log(`✔ ${name}`);
}
console.log(
  "\nDone. Set RESEND_API_KEY too to send real sign-in emails; without it, codes are logged and written to the internal emailOutbox table.",
);
