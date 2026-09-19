/**
 * Prints the latest sign-in code sent to an address on the dev deployment.
 *
 *   pnpm --filter @repo/api seed:dev:code maya.matchmaker@matchmaker-dev.test
 *
 * Dev has no RESEND_API_KEY, so codes land in the internal `emailOutbox`
 * table; this reads it through `email/queries:latestOutboxEmail`. Request the
 * code in the app first, then run this.
 */

import { spawnSync } from "node:child_process";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: seed:dev:code <email>");
  process.exit(1);
}

const result = spawnSync(
  "npx",
  [
    "convex",
    "run",
    "email/queries:latestOutboxEmail",
    JSON.stringify({ to: email }),
  ],
  { encoding: "utf-8" },
);
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

const latest = JSON.parse(result.stdout.trim() || "null");
const code = latest?.text.match(/\b\d{6}\b/)?.[0];
if (code === undefined) {
  console.error(
    `No sign-in code found for ${email}. Request one in the app first.`,
  );
  process.exit(1);
}
console.log(code);
