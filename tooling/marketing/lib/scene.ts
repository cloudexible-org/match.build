import { resetAndSeedBaseline } from "@repo/harness/reset";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import type { ScenarioSpec } from "../../../packages/api/convex/seed/e2e/scenario";

/**
 * Seeds one capture's world, having first emptied the database.
 *
 * ── Why a capture resets, where a spec must not ─────────────────────────────
 *
 * `tooling/e2e` runs spec files in parallel and keeps them apart by namespace:
 * the seeder appends a per-file suffix to every name, slug and address it
 * invents, so two files can never see each other's rows. That works because a
 * spec does not care what its people are *called* —
 * `sam.e7cd29bdc@matchmaker-e2e.test` asserts exactly as well as anything else.
 *
 * A capture is the opposite: the names and addresses are the subject. They are
 * on camera, in the candidate list, in the conversation header and in the
 * Details panel, and they have to read as a real book — and to stay the *same*
 * across clips, because the finished film cuts between them and a Sam whose
 * address changed between two scenes looks like two different people.
 *
 * So every capture names its people explicitly, which throws the namespacing
 * away, which means two captures asking for `sam.okonkwo@example.com` collide.
 * The seed writes `users` rows directly and does not enforce one account per
 * address the way sign-up does, so the second capture got a *second* Sam while
 * `signInAs` kept resolving the first — who owned none of its matchmakers. The
 * symptom was a five-minute timeout on a "Page not found", in every capture but
 * the first, and only when they ran together.
 *
 * Emptying the database first removes the whole class of collision and costs
 * nothing worth having: captures run one at a time (`workers: 1` in
 * `playwright.config.ts`, because two of them writing frames at once would
 * fight for the CPU the screenshots need), each one is a scene, and no capture
 * asserts anything about another. `resetAndSeedBaseline` also restores the
 * baseline fixture, so the platform-admin accounts `admin-ai-cost` signs in
 * with are there again afterwards.
 *
 * **Use this in every capture's `beforeAll`, never `seedScenario` directly.**
 */
export async function seedScene(
  spec: Omit<ScenarioSpec, "ns"> & { ns?: string },
): Promise<Scenario> {
  await resetAndSeedBaseline();
  return seedScenario(spec);
}
