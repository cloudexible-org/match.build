/**
 * Everything a candidate's profile can hold (prd/phase-2.md §3): the registry
 * of structured fields, the suggested keys for free-text notes, and who is
 * allowed to write each.
 *
 * The machinery around a value — validation, the write policy, how an agent's
 * proposal works — is shared with the matchmaker's profile and lives in
 * `convex/profiles/`. This file is the *content*: what a candidate profile is
 * about.
 *
 * ─── Why a registry rather than columns ─────────────────────────────────────
 *
 * Every value carries metadata: who wrote it, when, from which message, and
 * whether an agent has a proposal waiting on it. Forty typed columns would
 * become forty nested objects, and adding a field would be a schema migration
 * every time. So the *table* holds two maps of entries and this file holds the
 * types. Adding a field is an edit here.
 *
 * The cost is that a stored value is a string. It is a **normalised** string —
 * `valueError` then `normaliseValue` is the only way one reaches the database
 * — so "yes", "1987-03-14" and "28-36" mean exactly one thing each. Phase 3's
 * match pre-filter reads these keys, which is why a key, once used, is a
 * migration rather than an edit.
 *
 * Plain code with no Convex imports, exported through `@repo/api`.
 */

import {
  humaniseKey,
  type ProfileFieldDef,
  type ProfileWritePolicy,
} from "../profiles/rules";

export type CandidateFieldGroup =
  | "identity"
  | "location"
  | "lifestyle"
  | "beliefs"
  | "family"
  | "relationship"
  | "seeking";

export const CANDIDATE_GROUP_LABELS: Record<CandidateFieldGroup, string> = {
  identity: "About them",
  location: "Where they are",
  lifestyle: "Lifestyle",
  beliefs: "Beliefs",
  family: "Family",
  relationship: "Relationships",
  seeking: "What they're looking for",
};

/** Groups in the order the Profile section renders them. */
export const CANDIDATE_GROUP_ORDER: readonly CandidateFieldGroup[] = [
  "identity",
  "location",
  "relationship",
  "family",
  "lifestyle",
  "beliefs",
  "seeking",
];

export type CandidateFieldDef = ProfileFieldDef & {
  group: CandidateFieldGroup;
};

const YES_NO = ["yes", "no"] as const;
const YES_NO_MAYBE = ["yes", "no", "maybe"] as const;
const IMPORTANCE = ["low", "medium", "high"] as const;

/**
 * Every structured field a candidate profile can hold.
 *
 * A key here is a promise: phase 3's hard pre-filter reads these, so renaming
 * one later is a data migration. Adding one is free.
 */
export const CANDIDATE_PROFILE_FIELDS: readonly CandidateFieldDef[] = [
  // ─── Identity ─────────────────────────────────────────────────────────────
  {
    key: "dateOfBirth",
    label: "Date of birth",
    group: "identity",
    value: { kind: "date" },
    // A model that reads "I'm 34" and writes a birth date has invented eleven
    // months of it. It may propose; a person confirms.
    policy: "suggest",
    personal: true,
    hint: "Authoritative when known; otherwise use Age.",
  },
  {
    key: "age",
    label: "Age",
    group: "identity",
    value: { kind: "integer", min: 18, max: 110 },
    policy: "agent",
    personal: false,
    hint: "What's known when there's no birth date. Date of birth wins.",
  },
  {
    key: "gender",
    label: "Gender",
    group: "identity",
    value: { kind: "choice", options: ["woman", "man", "non-binary", "other"] },
    policy: "agent",
    personal: true,
  },
  {
    key: "pronouns",
    label: "Pronouns",
    group: "identity",
    value: { kind: "text", maxLength: 40 },
    policy: "agent",
    personal: false,
  },
  {
    key: "heightCm",
    label: "Height (cm)",
    group: "identity",
    value: { kind: "integer", min: 120, max: 230 },
    policy: "agent",
    personal: false,
  },
  {
    key: "ethnicity",
    label: "Ethnicity",
    group: "identity",
    value: { kind: "text", maxLength: 80 },
    policy: "suggest",
    personal: true,
  },
  {
    key: "languages",
    label: "Languages",
    group: "identity",
    value: { kind: "list", maxItems: 10, maxLength: 40 },
    policy: "agent",
    personal: false,
  },
  {
    key: "occupation",
    label: "Occupation",
    group: "identity",
    value: { kind: "text", maxLength: 120 },
    policy: "agent",
    personal: true,
  },
  {
    key: "education",
    label: "Education",
    group: "identity",
    value: {
      kind: "choice",
      options: [
        "school",
        "vocational",
        "undergraduate",
        "postgraduate",
        "doctorate",
      ],
    },
    policy: "agent",
    personal: false,
  },
  {
    key: "incomeBand",
    label: "Income band",
    group: "identity",
    value: {
      kind: "choice",
      options: ["not-disclosed", "modest", "comfortable", "high", "very-high"],
    },
    // Money is a matchmaker's own read on someone, and a model inferring it
    // from a job title is a guess with consequences.
    policy: "matchmaker",
    personal: true,
  },

  // ─── Location ─────────────────────────────────────────────────────────────
  {
    key: "locationCity",
    label: "City",
    group: "location",
    value: { kind: "text", maxLength: 80 },
    policy: "agent",
    personal: true,
  },
  {
    key: "locationCountry",
    label: "Country",
    group: "location",
    value: { kind: "text", maxLength: 80 },
    policy: "agent",
    personal: true,
  },
  {
    key: "nationality",
    label: "Nationality",
    group: "location",
    value: { kind: "text", maxLength: 80 },
    policy: "agent",
    personal: true,
  },
  {
    key: "willingToRelocate",
    label: "Willing to relocate",
    group: "location",
    value: { kind: "choice", options: YES_NO_MAYBE },
    policy: "agent",
    personal: false,
  },
  {
    key: "livingSituation",
    label: "Living situation",
    group: "location",
    value: {
      kind: "choice",
      options: ["alone", "with-flatmates", "with-family", "with-children"],
    },
    policy: "agent",
    personal: false,
  },

  // ─── Relationships ────────────────────────────────────────────────────────
  {
    key: "orientation",
    label: "Orientation",
    group: "relationship",
    value: {
      kind: "choice",
      options: [
        "straight",
        "gay",
        "lesbian",
        "bisexual",
        "pansexual",
        "asexual",
        "queer",
        "other",
      ],
    },
    // Special-category data about someone's sex life. A model may notice it; a
    // person decides it is on the record.
    policy: "suggest",
    personal: true,
  },
  {
    key: "relationshipStatus",
    label: "Relationship status",
    group: "relationship",
    value: {
      kind: "choice",
      options: ["single", "separated", "divorced", "widowed"],
    },
    policy: "agent",
    personal: false,
  },
  {
    key: "previousMarriages",
    label: "Previous marriages",
    group: "relationship",
    value: { kind: "integer", min: 0, max: 10 },
    policy: "agent",
    personal: false,
  },
  {
    key: "longestRelationshipYears",
    label: "Longest relationship (years)",
    group: "relationship",
    value: { kind: "integer", min: 0, max: 80 },
    policy: "agent",
    personal: false,
  },
  {
    key: "lookingFor",
    label: "Looking for",
    group: "relationship",
    value: {
      kind: "choice",
      options: ["marriage", "long-term", "companionship", "unsure"],
    },
    policy: "agent",
    personal: false,
  },
  {
    key: "readinessTimeline",
    label: "Timeline",
    group: "relationship",
    value: { kind: "text", maxLength: 120 },
    policy: "agent",
    personal: false,
    hint: "How soon they want this to be serious.",
  },

  // ─── Family ───────────────────────────────────────────────────────────────
  {
    key: "hasKids",
    label: "Has children",
    group: "family",
    value: { kind: "choice", options: YES_NO },
    policy: "agent",
    personal: false,
  },
  {
    key: "kidsCount",
    label: "How many children",
    group: "family",
    value: { kind: "integer", min: 0, max: 12 },
    policy: "agent",
    personal: false,
  },
  {
    key: "kidsLivingAtHome",
    label: "Children at home",
    group: "family",
    value: { kind: "choice", options: ["all", "some", "none"] },
    policy: "agent",
    personal: false,
  },
  {
    key: "wantsKids",
    label: "Wants children",
    group: "family",
    value: { kind: "choice", options: [...YES_NO_MAYBE, "open"] },
    policy: "agent",
    personal: false,
  },
  {
    key: "wantsKidsCount",
    label: "How many they want",
    group: "family",
    value: { kind: "integer", min: 0, max: 12 },
    policy: "agent",
    personal: false,
  },
  {
    key: "familyImportance",
    label: "Importance of family",
    group: "family",
    value: { kind: "choice", options: IMPORTANCE },
    policy: "agent",
    personal: false,
  },

  // ─── Lifestyle ────────────────────────────────────────────────────────────
  {
    key: "smoking",
    label: "Smoking",
    group: "lifestyle",
    value: {
      kind: "choice",
      options: ["never", "socially", "regularly", "quitting"],
    },
    policy: "agent",
    personal: false,
  },
  {
    key: "drinking",
    label: "Drinking",
    group: "lifestyle",
    value: { kind: "choice", options: ["never", "socially", "regularly"] },
    policy: "agent",
    personal: false,
  },
  {
    key: "drugs",
    label: "Recreational drugs",
    group: "lifestyle",
    value: { kind: "choice", options: ["never", "socially", "regularly"] },
    policy: "suggest",
    personal: true,
  },
  {
    key: "diet",
    label: "Diet",
    group: "lifestyle",
    value: {
      kind: "choice",
      options: [
        "omnivore",
        "pescatarian",
        "vegetarian",
        "vegan",
        "halal",
        "kosher",
        "other",
      ],
    },
    policy: "agent",
    personal: false,
  },
  {
    key: "exercise",
    label: "Exercise",
    group: "lifestyle",
    value: {
      kind: "choice",
      options: ["rarely", "sometimes", "often", "daily"],
    },
    policy: "agent",
    personal: false,
  },
  {
    key: "pets",
    label: "Pets",
    group: "lifestyle",
    value: { kind: "text", maxLength: 120 },
    policy: "agent",
    personal: false,
  },

  // ─── Beliefs ──────────────────────────────────────────────────────────────
  {
    key: "religion",
    label: "Religion",
    group: "beliefs",
    value: { kind: "text", maxLength: 80 },
    policy: "suggest",
    personal: true,
  },
  {
    key: "religionImportance",
    label: "Importance of religion",
    group: "beliefs",
    value: { kind: "choice", options: IMPORTANCE },
    policy: "agent",
    personal: false,
  },
  {
    key: "politics",
    label: "Politics",
    group: "beliefs",
    value: { kind: "text", maxLength: 80 },
    policy: "suggest",
    personal: true,
  },
  {
    key: "politicsImportance",
    label: "Importance of politics",
    group: "beliefs",
    value: { kind: "choice", options: IMPORTANCE },
    policy: "agent",
    personal: false,
  },

  // ─── What they're looking for ─────────────────────────────────────────────
  {
    key: "seekingGender",
    label: "Seeking",
    group: "seeking",
    value: {
      kind: "choices",
      options: ["women", "men", "non-binary people", "anyone"],
    },
    policy: "agent",
    personal: false,
  },
  {
    key: "partnerAgeRange",
    label: "Partner age range",
    group: "seeking",
    value: { kind: "range", min: 18, max: 110 },
    policy: "agent",
    personal: false,
    hint: "Two ages, youngest first — 28-36.",
  },
  {
    key: "partnerHeightRangeCm",
    label: "Partner height range (cm)",
    group: "seeking",
    value: { kind: "range", min: 120, max: 230 },
    policy: "agent",
    personal: false,
  },
  {
    key: "partnerWantsKids",
    label: "Partner should want children",
    group: "seeking",
    value: { kind: "choice", options: [...YES_NO_MAYBE, "dealbreaker"] },
    policy: "agent",
    personal: false,
  },
  {
    key: "partnerHasKidsOk",
    label: "Partner having children is fine",
    group: "seeking",
    value: { kind: "choice", options: YES_NO_MAYBE },
    policy: "agent",
    personal: false,
  },
  {
    key: "partnerReligion",
    label: "Partner's religion",
    group: "seeking",
    value: { kind: "text", maxLength: 80 },
    policy: "suggest",
    personal: true,
  },
  {
    key: "partnerReligionRequired",
    label: "Shared religion required",
    group: "seeking",
    value: { kind: "choice", options: ["yes", "preferred", "no"] },
    policy: "agent",
    personal: false,
  },
  {
    key: "partnerEducation",
    label: "Partner's education",
    group: "seeking",
    value: {
      kind: "choice",
      options: ["no-preference", "undergraduate", "postgraduate", "doctorate"],
    },
    policy: "agent",
    personal: false,
  },
  {
    key: "partnerLocation",
    label: "Where a partner can be",
    group: "seeking",
    value: { kind: "text", maxLength: 120 },
    policy: "agent",
    personal: false,
  },
  {
    key: "partnerMaxDistanceKm",
    label: "Maximum distance (km)",
    group: "seeking",
    value: { kind: "integer", min: 0, max: 20_000 },
    policy: "agent",
    personal: false,
  },
  {
    key: "dealbreakers",
    label: "Dealbreakers",
    group: "seeking",
    value: { kind: "text", maxLength: 600 },
    policy: "suggest",
    personal: false,
  },
] as const;

export function candidateField(key: string): CandidateFieldDef | null {
  return CANDIDATE_PROFILE_FIELDS.find((field) => field.key === key) ?? null;
}

/*
 * ─── Free-text notes ────────────────────────────────────────────────────────
 *
 * The other half of a profile: prose that has no shape worth pinning down. The
 * keys below are *suggestions*, not a closed set — a matchmaker names their own
 * and so may an agent.
 *
 * Which is why an unknown key is `suggest` (`candidateNotePolicy`): a key
 * nobody has thought about is exactly the one an agent should be asking about
 * rather than inventing.
 */

export type CandidateNoteDef = {
  key: string;
  label: string;
  policy: ProfileWritePolicy;
  hint?: string;
};

export const CANDIDATE_PROFILE_NOTES: readonly CandidateNoteDef[] = [
  {
    key: "howTheyDescribeThemselves",
    label: "How they describe themselves",
    policy: "agent",
  },
  {
    key: "whatTheyreLookingFor",
    label: "What they're looking for",
    policy: "agent",
  },
  { key: "idealWeekend", label: "Ideal weekend", policy: "agent" },
  { key: "hobbies", label: "Hobbies and interests", policy: "agent" },
  { key: "travel", label: "Travel", policy: "agent" },
  { key: "careerAmbitions", label: "Career ambitions", policy: "agent" },
  { key: "familyBackground", label: "Family background", policy: "agent" },
  { key: "loveLanguage", label: "Love language", policy: "suggest" },
  {
    key: "conflictStyle",
    label: "How they handle conflict",
    policy: "suggest",
  },
  {
    key: "pastRelationships",
    label: "What went wrong before",
    policy: "suggest",
  },
  {
    key: "matchmakerNotes",
    label: "Notes",
    // Where the notes table's entries landed when it was replaced
    // (prd/phase-2.md §3). The matchmaker's own words about their own work.
    policy: "matchmaker",
    hint: "Only you. The assistant never touches this.",
  },
  {
    key: "matchmakerTake",
    label: "Your read on them",
    policy: "matchmaker",
    hint: "Only you. The assistant never touches this.",
  },
] as const;

/** A suggested note key's label, or the key itself for one somebody invented. */
export function candidateNoteLabel(key: string): string {
  const known = CANDIDATE_PROFILE_NOTES.find((note) => note.key === key);
  return known?.label ?? humaniseKey(key);
}

/** An unknown key is `suggest`: see the comment above. */
export function candidateNotePolicy(key: string): ProfileWritePolicy {
  return (
    CANDIDATE_PROFILE_NOTES.find((note) => note.key === key)?.policy ??
    "suggest"
  );
}

/*
 * ─── The audit trail ────────────────────────────────────────────────────────
 *
 * A profile change records the entry it touched as `facts.wantsKids` or
 * `notes.idealWeekend`, so one vocabulary of audit actions covers every field
 * without the trail losing which one moved (`audit/rules.ts`).
 */

export type CandidateEntryKind = "facts" | "notes";

export function candidateAuditField(
  kind: CandidateEntryKind,
  key: string,
): string {
  return `${kind}.${key}`;
}

/** The readable label for a `candidateAuditField`, or `null` if it isn't one. */
export function candidateProfileFieldLabel(auditField: string): string | null {
  const dot = auditField.indexOf(".");
  if (dot === -1) return null;
  const kind = auditField.slice(0, dot);
  const key = auditField.slice(dot + 1);
  if (kind === "notes") return candidateNoteLabel(key);
  if (kind !== "facts") return null;
  return candidateField(key)?.label ?? key;
}

/**
 * Whether an erasure replaces this entry's value, in the profile and in the
 * audit trail (`admin/mutations.ts`). True for the identifying and
 * special-category fields the registry marks `personal`.
 *
 * **Free-text notes are never redacted**, on the same grounds as a note body
 * and a message body were in phase 1 (prd/phase-1.md §12): they are the
 * matchmaker's own words about their own work, and whether a particular
 * request reaches into them is the controller's call, not this function's.
 */
export function candidateEntryHoldsPersonalData(auditField: string): boolean {
  const dot = auditField.indexOf(".");
  if (dot === -1 || auditField.slice(0, dot) !== "facts") return false;
  return candidateField(auditField.slice(dot + 1))?.personal === true;
}
