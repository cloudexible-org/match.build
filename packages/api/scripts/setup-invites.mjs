/**
 * Sets INVITE_LINK_SECRET — the HMAC key invite-link tokens are derived from
 * (convex/invites/helpers.ts) — on the deployment the Convex CLI resolves
 * (your dev deployment, from packages/api/.env.local), or on prod.
 *
 *   pnpm --filter @repo/api invites:setup
 *   pnpm --filter @repo/api invites:setup --prod
 *
 * Refuses to replace an existing secret unless you pass --force: rotating it
 * breaks every open invite link (candidates can still be re-invited).
 *
 * The e2e suite does NOT use this — it sets a fresh secret on its own local
 * backend every run (apps/e2e/auth-env.ts).
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const target = args.includes("--prod") ? ["--prod"] : [];

function convex(commandArgs, input) {
  return spawnSync("npx", ["convex", ...commandArgs, ...target], {
    input,
    encoding: "utf-8",
    stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
  });
}

const existing = convex(["env", "get", "INVITE_LINK_SECRET"]);
if (
  existing.status === 0 &&
  existing.stdout.trim() &&
  !args.includes("--force")
) {
  console.error(
    "INVITE_LINK_SECRET is already set on this deployment. Re-run with --force to rotate it (this breaks every open invite link).",
  );
  process.exit(1);
}

const result = convex(
  ["env", "set", "INVITE_LINK_SECRET"],
  randomBytes(32).toString("base64url"),
);
if (result.status !== 0) {
  console.error(`Failed to set INVITE_LINK_SECRET:\n${result.stderr}`);
  process.exit(1);
}
console.log("✔ INVITE_LINK_SECRET");
