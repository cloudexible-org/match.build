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

/**
 * An agent's open proposal on one entry (prd/phase-2.md §3) — the state no
 * amount of clicking can reach, because only an agent writes one and none has
 * run yet. Seeded so the suggestion cards above the composer have something to
 * show (`apps/app/src/chat/suggestion-stack.tsx`).
 */
export type DevSuggestion = {
  kind: "facts" | "notes";
  /** A key from the registry in `candidateProfiles/rules.ts`. */
  key: string;
  value: string;
  /** What is recorded now, so the card reads "old → new" rather than just "new". */
  current?: string;
  /** The proposal being that the entry go, rather than a new value. */
  remove?: boolean;
  /** The candidate's own words behind it, quoted under the proposal. */
  quote?: string;
};

/** The matchmaker's record of a candidate (prd/phase-2.md §3). */
export type DevProfile = {
  /** Keyed by the registry; values have to pass its validation. */
  facts?: Record<string, string>;
  /** Keyed by anything; the known keys are `CANDIDATE_PROFILE_NOTES`. */
  notes?: Record<string, string>;
  suggestions?: DevSuggestion[];
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
  profile?: DevProfile;
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
  /** Their voice, as if they had written it themselves (prd/phase-2.md §4.1C). */
  voice:
    "Warm and brief. I open with their name and close with a question, and I never write more than a short paragraph.",
  /**
   * A voice the agent has drafted and nobody has answered. It puts a
   * "Suggested change to your profile" row above the composer in **every**
   * conversation until it is accepted or dismissed, which is the point: it is
   * about the matchmaker, not about whoever they happen to be reading.
   */
  voiceSuggestion:
    "Warm and brief. I open with their name and close with a question, I never write more than a short paragraph, and I say what I actually think of a match rather than hedging.",
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
    // Four open proposals, so the "Suggested change to their profile" row has
    // arrows and a 1/4 counter — and one of each way a proposal can read: a
    // value where nothing was recorded, one that replaces what is, one that
    // asks for an entry to go, and a free-text note. Every quote is something
    // Sam actually says in the thread above.
    profile: {
      facts: { lookingFor: "unsure", pets: "A cat, Miso", wantsKids: "maybe" },
      notes: {
        matchmakerNotes: "Easy to talk to. Would introduce to Jordan first.",
      },
      suggestions: [
        {
          kind: "facts",
          key: "locationCity",
          value: "Toronto",
          quote: "Based in Toronto.",
        },
        {
          kind: "facts",
          key: "lookingFor",
          value: "long-term",
          current: "unsure",
          quote: "Someone kind and curious who loves the outdoors.",
        },
        // The agent has heard the cat is no longer around.
        { kind: "facts", key: "pets", value: "", remove: true },
        {
          kind: "notes",
          key: "whatTheyreLookingFor",
          value:
            "Someone kind and curious, outdoorsy, and near enough to Toronto to see on a weeknight.",
          quote: "Someone kind and curious who loves the outdoors.",
        },
      ],
    },
  },
  {
    userSlug: "jordan",
    messages: [],
    // One proposal, so the same row appears without arrows or a counter —
    // worth seeing beside Sam's, because it is a different card.
    profile: {
      facts: { wantsKids: "yes" },
      suggestions: [
        {
          kind: "notes",
          key: "hobbies",
          value: "Climbing, and a long-running Sunday supper club.",
        },
      ],
    },
  },
  // Nothing pending: the matchmaker's own voice draft is the only row here,
  // and once that is answered the stack disappears entirely.
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
