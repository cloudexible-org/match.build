/**
 * The baseline seed, re-exported for specs and captures.
 *
 * `packages/api/convex/seed/e2e/fixture.ts` is the single definition of the
 * shared, read-only world every run starts from (see §8 of
 * `docs/e2e-architecture.md`). Consumers reach it through here rather than
 * through a relative path of their own: `../../../../packages/api/…` is
 * correct only for a file at one particular depth, and `tooling/e2e/specs/…`
 * and `tooling/marketing/captures/…` do not sit at the same one.
 *
 * Types only where they are types — nothing here pulls in Convex's generated
 * API, so the harness typecheck stays independent of codegen.
 */

export type {
  SeedInvite,
  SeedManifest,
  SeedMatchmaker,
  SeedMembership,
  SeedUser,
} from "../../packages/api/convex/seed/e2e/fixture";
export {
  SEED_ADMINS,
  SEED_CODE_TARGET,
  SEED_INVITES,
  SEED_MATCHMAKERS,
  SEED_MEMBERSHIPS,
  SEED_NOT_ADMIN,
  SEED_USERS,
} from "../../packages/api/convex/seed/e2e/fixture";
