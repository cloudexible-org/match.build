/**
 * Test accounts for the cloud dev deployment, written by `./mutations.ts`.
 *
 * Plain data with no Convex imports, like the e2e fixture. Unlike that one,
 * this seed never wipes anything: it only adds what is missing, so it is safe
 * to re-run against a dev database you have been clicking around in.
 *
 * All addresses use the reserved `.test` TLD. Dev has no RESEND_API_KEY, so a
 * sign-in code is written to the internal `emailOutbox` table instead; read it
 * with `pnpm --filter @repo/api seed:dev:code <email>`.
 */

export type DevUser = {
  slug: string;
  email: string;
  name: string;
  /** What the account is for, printed by the seed. */
  role: string;
};

export type DevMessage = {
  author: "matchmaker" | "candidate";
  visibility: "everyone" | "matchmaker";
  body: string;
};

/** A person in the matchmaker's book who has joined, with their thread. */
export type DevMember = {
  userSlug: string;
  messages: DevMessage[];
  /**
   * Set to seed someone who has since left (prd/phase-1.md §3.4), so the
   * read-only treatment — the badge, the closed composer, Re-invite — is
   * visible in dev without ending a real membership.
   */
  left?: { daysAgo: number; reason?: string };
};

export const DEV_DOMAIN = "matchmaker-dev.test";

export const DEV_USERS: DevUser[] = [
  // Owns the matchmaker profile below.
  {
    slug: "matchmaker",
    email: `maya.matchmaker@${DEV_DOMAIN}`,
    name: "Maya Matchmaker",
    role: "matchmaker (owns maya.matches)",
  },
  // Joined Maya's book; the candidate side of a conversation.
  {
    slug: "candidate",
    email: `sam.candidate@${DEV_DOMAIN}`,
    name: "Sam Candidate",
    role: "candidate (joined, has messages)",
  },
  // Two more joined members, so the book is not a list of one.
  {
    slug: "jordan",
    email: `jordan.member@${DEV_DOMAIN}`,
    name: "Jordan Member",
    role: "candidate (joined)",
  },
  {
    slug: "alex",
    email: `alex.member@${DEV_DOMAIN}`,
    name: "Alex Member",
    role: "candidate (joined)",
  },
  // Has an open invitation from Maya and has not joined.
  {
    slug: "invited",
    email: `ivy.invited@${DEV_DOMAIN}`,
    name: "Ivy Invited",
    role: "invited by Maya (not joined)",
  },
  // Joined, then left: the matchmaker's read-only view of a past candidate.
  {
    slug: "left",
    email: `lee.left@${DEV_DOMAIN}`,
    name: "Lee Left",
    role: "candidate (left Maya's book)",
  },
  // Verified account with nothing attached, for onboarding.
  {
    slug: "blank",
    email: `nora.new@${DEV_DOMAIN}`,
    name: "Nora New",
    role: "new user (nothing attached)",
  },
];

export const DEV_MATCHMAKER = {
  ownerSlug: "matchmaker",
  username: "maya.matches",
  displayName: "Maya Matches",
  businessName: "Maya Matches Introductions",
};

export const DEV_MEMBERS: DevMember[] = [
  {
    userSlug: "candidate",
    messages: [
      {
        author: "matchmaker",
        visibility: "everyone",
        body: "Hi Sam, welcome! Tell me a little about what you're looking for.",
      },
      {
        author: "candidate",
        visibility: "everyone",
        body: "Someone kind and curious who loves the outdoors. Based in Toronto.",
      },
      {
        author: "matchmaker",
        visibility: "matchmaker",
        body: "Private: strong fit for Jordan, check availability next week.",
      },
    ],
  },
  { userSlug: "jordan", messages: [] },
  { userSlug: "alex", messages: [] },
  {
    userSlug: "left",
    messages: [
      {
        author: "matchmaker",
        visibility: "everyone",
        body: "All the best, Lee — do come back if anything changes.",
      },
    ],
    left: { daysAgo: 12, reason: "Met someone, thank you!" },
  },
];

/** Users invited to Maya's book who have not accepted. */
export const DEV_INVITED_SLUGS = ["invited"];
