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
  /**
   * Keyed by the registry; values have to pass its validation.
   *
   * A `dateOfBirth` here is a fixed date, so the age the app reads off it goes
   * up by one on that date every year. That is the point of storing the date
   * rather than the age, and it is why this seed no longer carries an `age`.
   */
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
  /**
   * Replies the assistant has drafted and nobody has answered
   * (prd/phase-2.md §4A). Seeded because a dev deployment may have no gateway,
   * and because waiting five seconds for a real generation is a poor way to
   * look at a card. Newest last.
   */
  replyDrafts?: string[];
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
  // Four more joined members with filled-in profiles, so the match board has
  // a book to work on (prd/phase-3.md §2). Between them they produce a strong
  // pair, a thin one, and pairs the hard filters refuse outright.
  {
    slug: "priya",
    email: `priya.member@${DEV_DOMAIN}`,
    name: "Priya Member",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "daniel",
    email: `daniel.member@${DEV_DOMAIN}`,
    name: "Daniel Member",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "nadia",
    email: `nadia.member@${DEV_DOMAIN}`,
    name: "Nadia Member",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "theo",
    email: `theo.member@${DEV_DOMAIN}`,
    name: "Theo Member",
    role: "candidate (joined, full profile)",
  },
  // Nine more, so the nightly run has a book to work on rather than a
  // handful of pairs (prd/phase-3.md §2). Between them: several strong
  // pairs, a pair only the matchmaker would have made, and people no filter
  // will let through.
  {
    slug: "sofia",
    email: `sofia.member@${DEV_DOMAIN}`,
    name: "Sofia Ruiz",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "amara",
    email: `amara.member@${DEV_DOMAIN}`,
    name: "Amara Diallo",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "rosa",
    email: `rosa.member@${DEV_DOMAIN}`,
    name: "Rosa Iyer",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "hana",
    email: `hana.member@${DEV_DOMAIN}`,
    name: "Hana Suzuki",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "marco",
    email: `marco.member@${DEV_DOMAIN}`,
    name: "Marco Bianchi",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "omar",
    email: `omar.member@${DEV_DOMAIN}`,
    name: "Omar Haddad",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "ben",
    email: `ben.member@${DEV_DOMAIN}`,
    name: "Ben Okafor",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "felix",
    email: `felix.member@${DEV_DOMAIN}`,
    name: "Felix Meyer",
    role: "candidate (joined, full profile)",
  },
  {
    slug: "kai",
    email: `kai.member@${DEV_DOMAIN}`,
    name: "Kai Nakamura",
    role: "candidate (joined, full profile)",
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
      facts: {
        lookingFor: "unsure",
        pets: "A cat, Miso",
        wantsKids: "maybe",
        dateOfBirth: "1992-03-14",
        gender: "man",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "women",
        partnerAgeRange: "28-40",
        smoking: "never",
        drinking: "socially",
        languages: "English, French",
        exercise: "often",
        diet: "omnivore",
        education: "postgraduate",
        religion: "none",
        religionImportance: "low",
        familyImportance: "high",
      },
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
    // Three drafts, so the reply row has arrows and a 1/3 counter — and each
    // one answers what Sam actually said, in the voice seeded above.
    replyDrafts: [
      "Toronto is easy — I have a few people there. What does a good weekend outdoors look like for you?",
      "Lovely, thank you Sam. Kind and curious I can work with. Are you hiking most weekends, or is it more of a summer thing?",
      "That helps. One more and I will stop asking: when you picture this going well a year from now, what are you doing?",
    ],
  },
  {
    userSlug: "jordan",
    messages: [],
    // One proposal, so the same row appears without arrows or a counter —
    // worth seeing beside Sam's, because it is a different card.
    profile: {
      facts: {
        wantsKids: "yes",
        dateOfBirth: "1995-01-09",
        gender: "woman",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "men",
        partnerAgeRange: "30-42",
        lookingFor: "long-term",
        smoking: "never",
        drinking: "socially",
        languages: "English, Spanish",
        exercise: "sometimes",
        diet: "omnivore",
        education: "undergraduate",
        religion: "none",
        religionImportance: "low",
        familyImportance: "high",
      },
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
  {
    userSlug: "alex",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1988-07-22",
        gender: "man",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "men",
        partnerAgeRange: "32-46",
        lookingFor: "long-term",
        wantsKids: "no",
        smoking: "never",
        drinking: "socially",
        languages: "English",
        exercise: "often",
        diet: "omnivore",
        education: "undergraduate",
        religionImportance: "low",
        familyImportance: "medium",
      },
    },
  },
  // Priya and Daniel are the pair the algorithm should be most sure of: same
  // city, same religion and both of them say it matters, both want marriage
  // and children.
  {
    userSlug: "priya",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1993-05-02",
        gender: "woman",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "men",
        partnerAgeRange: "32-42",
        lookingFor: "marriage",
        wantsKids: "yes",
        religion: "Hindu",
        religionImportance: "high",
        partnerReligionRequired: "yes",
        smoking: "never",
        drinking: "never",
        diet: "vegetarian",
        languages: "English, Hindi",
        exercise: "often",
        education: "postgraduate",
        familyImportance: "high",
      },
      notes: { hobbies: "Running, and a book club she has run for years." },
    },
  },
  {
    userSlug: "daniel",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1990-02-18",
        gender: "man",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "women",
        partnerAgeRange: "30-38",
        lookingFor: "marriage",
        wantsKids: "yes",
        religion: "Hindu",
        religionImportance: "high",
        smoking: "never",
        drinking: "never",
        diet: "vegetarian",
        languages: "English, Hindi",
        exercise: "sometimes",
        education: "postgraduate",
        familyImportance: "high",
      },
    },
  },
  // Nadia is the thin end: another city, a different idea of what she wants,
  // and habits that don't line up. A card, but not a confident one.
  {
    userSlug: "nadia",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1997-08-11",
        gender: "woman",
        locationCity: "Montreal",
        locationCountry: "Canada",
        seekingGender: "men",
        partnerAgeRange: "28-40",
        lookingFor: "companionship",
        wantsKids: "maybe",
        smoking: "regularly",
        drinking: "regularly",
        languages: "French",
        exercise: "rarely",
        diet: "omnivore",
        education: "undergraduate",
        religionImportance: "low",
        familyImportance: "low",
      },
    },
  },
  // Theo is who the hard filters are for: nobody in this book is looking for
  // him, and he is looking for nobody in it either.
  {
    userSlug: "theo",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1982-04-27",
        gender: "man",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "women",
        partnerAgeRange: "20-26",
        lookingFor: "unsure",
        smoking: "regularly",
        drinking: "regularly",
        languages: "English",
        exercise: "rarely",
        diet: "omnivore",
        education: "school",
        religionImportance: "low",
        familyImportance: "low",
      },
    },
  },
  // ─── Women looking for men ──────────────────────────────────────────────
  {
    userSlug: "sofia",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1999-06-05",
        gender: "woman",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "men",
        partnerAgeRange: "27-38",
        lookingFor: "marriage",
        wantsKids: "yes",
        relationshipStatus: "single",
        religion: "Catholic",
        religionImportance: "medium",
        smoking: "never",
        drinking: "socially",
        diet: "vegetarian",
        exercise: "often",
        languages: "English, Spanish",
        education: "undergraduate",
        familyImportance: "high",
      },
      notes: { hobbies: "Climbing, and cooking for far too many people." },
    },
  },
  {
    userSlug: "amara",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1991-03-30",
        gender: "woman",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "men",
        partnerAgeRange: "33-45",
        lookingFor: "long-term",
        wantsKids: "maybe",
        hasKids: "yes",
        kidsCount: "1",
        relationshipStatus: "divorced",
        religionImportance: "low",
        smoking: "never",
        drinking: "socially",
        diet: "omnivore",
        exercise: "sometimes",
        languages: "English, French",
        education: "postgraduate",
        familyImportance: "medium",
      },
    },
  },
  {
    userSlug: "rosa",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1996-09-01",
        gender: "woman",
        locationCity: "Montreal",
        locationCountry: "Canada",
        // The one person in the book who is not looking for one gender.
        seekingGender: "men, non-binary people",
        partnerAgeRange: "28-40",
        lookingFor: "long-term",
        wantsKids: "open",
        willingToRelocate: "yes",
        relationshipStatus: "single",
        religionImportance: "low",
        smoking: "never",
        drinking: "socially",
        diet: "pescatarian",
        exercise: "often",
        languages: "English, French",
        education: "postgraduate",
        familyImportance: "medium",
      },
    },
  },
  {
    userSlug: "hana",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1988-01-24",
        gender: "woman",
        locationCity: "Vancouver",
        locationCountry: "Canada",
        seekingGender: "men",
        partnerAgeRange: "35-48",
        lookingFor: "marriage",
        wantsKids: "no",
        willingToRelocate: "maybe",
        relationshipStatus: "single",
        religionImportance: "low",
        smoking: "never",
        drinking: "never",
        diet: "omnivore",
        exercise: "daily",
        languages: "English, Japanese",
        education: "doctorate",
        familyImportance: "medium",
        // Free text no filter reads, so her cards carry the flag that says so.
        dealbreakers: "Smokers, and anyone who wants children.",
      },
    },
  },

  // ─── Men looking for women ──────────────────────────────────────────────
  {
    userSlug: "marco",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1994-07-08",
        gender: "man",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "women",
        partnerAgeRange: "27-36",
        lookingFor: "marriage",
        wantsKids: "yes",
        relationshipStatus: "single",
        religion: "Catholic",
        religionImportance: "medium",
        smoking: "never",
        drinking: "socially",
        diet: "omnivore",
        exercise: "often",
        languages: "English, Italian",
        education: "undergraduate",
        familyImportance: "high",
      },
    },
  },
  {
    userSlug: "omar",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1989-05-16",
        gender: "man",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "women",
        partnerAgeRange: "30-42",
        lookingFor: "marriage",
        wantsKids: "yes",
        relationshipStatus: "single",
        religion: "Muslim",
        religionImportance: "high",
        // Preferred rather than required, so he is still matchable — and the
        // religion signal is what carries it, which is the point of scoring
        // rather than filtering on everything.
        partnerReligionRequired: "preferred",
        smoking: "never",
        drinking: "never",
        diet: "halal",
        exercise: "sometimes",
        languages: "English, Arabic",
        education: "postgraduate",
        familyImportance: "high",
      },
    },
  },
  {
    userSlug: "ben",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1997-02-03",
        gender: "man",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "women",
        partnerAgeRange: "26-35",
        lookingFor: "long-term",
        wantsKids: "maybe",
        relationshipStatus: "single",
        religionImportance: "low",
        smoking: "never",
        drinking: "socially",
        diet: "omnivore",
        exercise: "often",
        languages: "English",
        education: "undergraduate",
        familyImportance: "medium",
      },
    },
  },
  {
    userSlug: "felix",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1985-08-19",
        gender: "man",
        locationCity: "Vancouver",
        locationCountry: "Canada",
        seekingGender: "women",
        partnerAgeRange: "34-45",
        lookingFor: "companionship",
        wantsKids: "no",
        hasKids: "yes",
        kidsCount: "2",
        relationshipStatus: "divorced",
        religionImportance: "low",
        smoking: "quitting",
        drinking: "regularly",
        diet: "omnivore",
        exercise: "rarely",
        languages: "English, German",
        education: "vocational",
        familyImportance: "low",
      },
    },
  },

  // ─── And the pair the book would otherwise have missed ──────────────────
  {
    userSlug: "kai",
    messages: [],
    profile: {
      facts: {
        dateOfBirth: "1990-06-21",
        gender: "man",
        locationCity: "Toronto",
        locationCountry: "Canada",
        seekingGender: "men",
        partnerAgeRange: "32-45",
        lookingFor: "long-term",
        wantsKids: "no",
        relationshipStatus: "single",
        religionImportance: "low",
        smoking: "never",
        drinking: "socially",
        diet: "omnivore",
        exercise: "often",
        languages: "English, Japanese",
        education: "postgraduate",
        familyImportance: "medium",
      },
    },
  },
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
