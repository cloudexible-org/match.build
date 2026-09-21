import { randomBytes } from "node:crypto";
import type {
  ScenarioManifest,
  ScenarioSpec,
} from "../../packages/api/convex/seed/e2e/scenario";
import { adminClient } from "./admin-client";

/**
 * Per-spec-file test data (see `packages/api/convex/seed/e2e/scenario.ts`).
 *
 * A spec file seeds its own world once, in `beforeAll`, and works only with
 * what comes back:
 *
 *   let world: Scenario;
 *   test.beforeAll(async () => {
 *     world = await seedScenario({
 *       users: [{ key: "maya" }, { key: "jane" }],
 *       matchmakers: [{ key: "book", ownerKey: "maya" }],
 *       candidates: [{ key: "jane", matchmakerKey: "book", userKey: "jane",
 *                      membership: "joined" }],
 *     });
 *   });
 *
 * The namespace is generated here, so two files — or two runs of one file —
 * can never write to the same rows. Nothing else in the suite can reach
 * them, which is what makes the files safe to run in parallel.
 */

export type Scenario = ScenarioManifest & {
  /** The seeded user's email, by key. Throws for an unknown key. */
  email(key: string): string;
  /** The seeded matchmaker's username, by key. */
  username(key: string): string;
  /** The seeded matchmaker's display name, by key. */
  displayName(key: string): string;
  /** A seeded candidate's id, by key. */
  candidateId(key: string): string;
  /** A seeded candidate's conversation id, by key. */
  conversationId(key: string): string;
  /** A seeded candidate's invite link path, by key. Throws without one. */
  invitePath(key: string): string;
  /** A seeded match card's id, by key. */
  matchId(key: string): string;
};

/** A namespace unique to this run: 4–12 lowercase letters/digits, letter first. */
export function scenarioNamespace(): string {
  return `e${randomBytes(4).toString("hex")}`;
}

export async function seedScenario(
  spec: Omit<ScenarioSpec, "ns"> & { ns?: string },
): Promise<Scenario> {
  const ns = spec.ns ?? scenarioNamespace();
  const manifest = (await adminClient().mutation(
    // By string: apps/e2e does not depend on the backend's generated API.
    "seed/e2e/mutations:scenario" as never,
    { ...spec, ns } as never,
  )) as ScenarioManifest;

  const lookup = <T>(kind: string, table: Record<string, T>, key: string) => {
    const found = table[key];
    if (found === undefined) {
      throw new Error(
        `Scenario ${manifest.ns} has no ${kind} "${key}" (seeded: ${Object.keys(table).join(", ") || "none"})`,
      );
    }
    return found;
  };

  return {
    ...manifest,
    email: (key) => lookup("user", manifest.users, key).email,
    username: (key) => lookup("matchmaker", manifest.matchmakers, key).username,
    displayName: (key) =>
      lookup("matchmaker", manifest.matchmakers, key).displayName,
    candidateId: (key) => lookup("candidate", manifest.candidates, key).id,
    conversationId: (key) =>
      lookup("candidate", manifest.candidates, key).conversationId,
    invitePath: (key) => {
      const token = lookup("candidate", manifest.candidates, key).inviteToken;
      if (token === null) {
        throw new Error(`Scenario candidate "${key}" has no invite`);
      }
      return `/app/invite/${token}`;
    },
    matchId: (key) => lookup("match", manifest.matches, key).id,
  };
}
