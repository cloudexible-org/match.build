import { adminClient } from "./admin-client";
import type { SeedManifest } from "./seed";

/**
 * Deletes every row the seed owns and re-applies the baseline fixture, leaving
 * the database exactly as a run's global setup leaves it.
 *
 * ── Who may call this ───────────────────────────────────────────────────────
 *
 * Two callers, and no others:
 *
 * - `fixtures/global-setup.ts`, once, before the suite.
 * - `tooling/marketing`, once per **capture**, because a capture is a scene
 *   that owns the whole database for its duration (`lib/scene.ts`).
 *
 * **Never from a spec.** `tooling/e2e` runs spec files in parallel and isolates
 * them by namespace instead; a spec calling this would delete the worlds of
 * every file running beside it, and the failures would land in those other
 * files rather than in the one at fault.
 *
 * Paged, because `reset` bounds each call: it deletes up to a page per table
 * per transaction and reports whether it is done, so a large table cannot blow
 * the transaction limit in one go.
 */
export async function resetAndSeedBaseline(): Promise<SeedManifest> {
  const client = adminClient();

  // Referenced by string rather than through the generated `internal.*` tree:
  // the harness has no dependency on the backend's generated API, and adding
  // one would drag Convex codegen into the e2e typecheck.
  let guard = 0;
  for (;;) {
    const { done } = (await client.mutation(
      "seed/e2e/mutations:reset" as never,
      {} as never,
    )) as { deleted: number; done: boolean };
    if (done) break;
    if (++guard > 100) {
      throw new Error(
        "seed reset did not converge after 100 pages — is something writing to the database?",
      );
    }
  }

  return (await client.mutation(
    "seed/e2e/mutations:apply" as never,
    {} as never,
  )) as SeedManifest;
}
