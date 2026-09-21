/**
 * Runs once before the suite: proves the Convex backend is ours, then rebuilds
 * the database from `packages/api/convex/seed/e2e/fixture.ts` so every test
 * starts from the same known world.
 *
 * Set `SKIP_SEED_IMPORT=true` to reuse whatever is already in the database —
 * handy when iterating on one spec against data you have hand-modified, but the
 * suite is only trustworthy on a fresh seed.
 *
 * When `E2E_CONVEX=0` there is no backend and nothing to seed; the remaining
 * specs assert only statically-rendered chrome. That is how CI runs.
 */

import { adminClient } from "../admin-client";
import { configureAuthEnv } from "../auth-env";
import { convexEnabled } from "../convex-enabled";
import { assertLocalBackendIdentity } from "../local-backend";
import type { SeedManifest } from "../seed";

async function globalSetup(): Promise<void> {
  if (!convexEnabled()) {
    console.log("⏭  E2E_CONVEX=0 — no Convex backend, skipping seed.");
    return;
  }

  // Before anything destructive: prove the backend we are about to wipe is this
  // project's, and not another Convex project that happened to claim the port.
  // Seeding deletes rows, so getting this wrong destroys someone else's data in
  // a run that otherwise goes green. This must stay ahead of the SKIP_SEED_IMPORT
  // short-circuit — a misdirected suite is worth stopping either way.
  await assertLocalBackendIdentity();

  // Convex Auth needs signing keys and the app's URL before anyone can sign
  // in. Set every run, seeded or not: the keys are fresh per run.
  const appPort = process.env.E2E_APP_PORT;
  if (!appPort) {
    throw new Error("E2E_APP_PORT is unset — run the suite via Playwright.");
  }
  await configureAuthEnv(`http://127.0.0.1:${appPort}/app`);

  if (process.env.SKIP_SEED_IMPORT === "true") {
    console.log("⏭  SKIP_SEED_IMPORT=true — reusing the database as-is.");
    return;
  }

  const client = adminClient();

  // Referenced by string rather than through the generated `internal.*` tree:
  // the harness has no dependency on the backend's generated API, and adding one
  // would drag Convex codegen into the e2e typecheck.
  let guard = 0;
  for (;;) {
    const { done } = (await client.mutation(
      "seed/e2e/mutations:reset" as never,
      {} as never,
    )) as {
      deleted: number;
      done: boolean;
    };
    if (done) break;
    if (++guard > 100) {
      throw new Error(
        "seed reset did not converge after 100 pages — is something writing to the database?",
      );
    }
  }

  const manifest = (await client.mutation(
    "seed/e2e/mutations:apply" as never,
    {} as never,
  )) as SeedManifest;

  console.log(
    `🌱 seeded ${Object.keys(manifest.users).length} users, ` +
      `${Object.keys(manifest.matchmakers).length} matchmaker profiles`,
  );
}

export default globalSetup;
