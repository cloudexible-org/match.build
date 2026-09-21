/**
 * The world the e2e suite starts from.
 *
 * Deliberately plain data with no Convex imports, so `apps/e2e` can import this
 * file directly and assert against the same constants the seed writes.
 *
 * ─── One seeded user per signing-in spec ────────────────────────────────────
 *
 * Requesting a sign-in code replaces any earlier unused code for the same
 * address, so two specs signing in as one seeded user in parallel would
 * invalidate each other's codes. Give every spec that signs in its own user.
 * Specs that sign *up* use a fresh address per run instead (see
 * `apps/e2e/specs/app-convex/`).
 *
 * All addresses use the reserved `.test` TLD, so nothing can ever be mailed.
 */

export type SeedUser = {
  slug: string;
  email: string;
  name: string;
};

export type SeedMatchmaker = {
  slug: string;
  ownerSlug: string;
  username: string;
  displayName: string;
};

/** A person who has joined a matchmaker's book. */
export type SeedMembership = {
  matchmakerSlug: string;
  userSlug: string;
};

/** A pending invitation to an email address. */
export type SeedInvite = {
  slug: string;
  matchmakerSlug: string;
  email: string;
};

export const SEED_USERS: SeedUser[] = [
  // Signs in in `home.spec.ts`: owns a matchmaker profile, has joined another
  // matchmaker, and has a pending invitation from a third.
  {
    slug: "returning",
    email: "returning.member@matchmaker-e2e.test",
    name: "Rowan Seedling",
  },
  // Own the other profiles; never sign in.
  {
    slug: "owner-b",
    email: "owner.b@matchmaker-e2e.test",
    name: "Bea Owner",
  },
  {
    slug: "owner-c",
    email: "owner.c@matchmaker-e2e.test",
    name: "Cal Owner",
  },
];

/**
 * Platform admins for `apps/admin` specs, one per signing-in spec. The e2e
 * harness lists them in `PLATFORM_ADMIN_EMAILS` (apps/e2e/auth-env.ts).
 */
export const SEED_ADMINS: SeedUser[] = [
  {
    slug: "admin-audit",
    email: "admin.audit@matchmaker-e2e.test",
    name: "Ada Audit",
  },
  {
    slug: "admin-codes",
    email: "admin.codes@matchmaker-e2e.test",
    name: "Cody Codes",
  },
  {
    slug: "admin-erasure",
    email: "admin.erasure@matchmaker-e2e.test",
    name: "Eve Erasure",
  },
  {
    slug: "admin-ai",
    email: "admin.ai@matchmaker-e2e.test",
    name: "Ali Agent",
  },
  {
    slug: "admin-layout",
    email: "admin.layout@matchmaker-e2e.test",
    name: "Lyn Layout",
  },
];

/**
 * An ordinary account a platform admin issues a sign-in code for in
 * `specs/admin-convex/sign-in-codes.spec.ts`, then signs in as. Never signs in
 * any other way.
 */
export const SEED_CODE_TARGET: SeedUser = {
  slug: "code-target",
  email: "code.target@matchmaker-e2e.test",
  name: "Tess Target",
};

/** Signs in to apps/admin in `specs/admin-convex/` and is turned away. */
export const SEED_NOT_ADMIN: SeedUser = {
  slug: "not-admin",
  email: "not.admin@matchmaker-e2e.test",
  name: "Nora Nonadmin",
};

export const SEED_MATCHMAKERS: SeedMatchmaker[] = [
  {
    slug: "own",
    ownerSlug: "returning",
    username: "rowan.matches",
    displayName: "Seeded: Rowan Matches",
  },
  {
    slug: "joined",
    ownerSlug: "owner-b",
    username: "bea.introductions",
    displayName: "Seeded: Bea Introductions",
  },
  {
    slug: "inviting",
    ownerSlug: "owner-c",
    username: "cal.connections",
    displayName: "Seeded: Cal Connections",
  },
];

export const SEED_MEMBERSHIPS: SeedMembership[] = [
  { matchmakerSlug: "joined", userSlug: "returning" },
];

export const SEED_INVITES: SeedInvite[] = [
  {
    slug: "for-returning",
    matchmakerSlug: "inviting",
    email: "returning.member@matchmaker-e2e.test",
  },
];

/** Slug → document id, returned by `apply` so tests never hard-code an id. */
export type SeedManifest = {
  users: Record<string, string>;
  matchmakers: Record<string, string>;
};
