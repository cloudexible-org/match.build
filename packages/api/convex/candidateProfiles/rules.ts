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

import { todayLine } from "../ai/rules";
import {
  humaniseKey,
  type ProfileFieldDef,
  type ProfileValueKind,
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
    hint: "The only age the record keeps. A stated age goes in the notes.",
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

/**
 * The fields a match is actually decided on, in the order it is natural to
 * learn them.
 *
 * `matches/rules.ts` reads exactly these: `hardBlockers` refuses a pair over
 * them and every weighted signal scores one. A profile missing them cannot be
 * matched however much prose it carries, which is why the drafting agent is
 * shown the unfilled ones first (`replySuggestions/rules.ts`).
 *
 * **Ordered for a conversation, not for the matcher.** What someone does for a
 * living is a first-exchange question and what they will not compromise on is
 * not, so the cheap and public ones lead and the ones that need some warmth
 * behind them come last. The agent is told to pick what fits rather than to
 * work down the list, but the order is what it sees first.
 *
 * Not every registry key is here, and that is the point — a gap list of all
 * forty-seven is a form. `rules.test.ts` asserts each key below is a real
 * field; nothing can assert this stays in step with the matcher's own reads,
 * so a new signal there wants a line here.
 */
export const MATCH_CRITICAL_KEYS: readonly string[] = [
  "locationCity",
  "occupation",
  "dateOfBirth",
  "gender",
  "seekingGender",
  "orientation",
  "lookingFor",
  "relationshipStatus",
  "locationCountry",
  "heightCm",
  "education",
  "exercise",
  "diet",
  "drinking",
  "smoking",
  "wantsKids",
  "hasKids",
  "religion",
  "religionImportance",
  "politics",
  "readinessTimeline",
  "willingToRelocate",
  "partnerAgeRange",
  "partnerLocation",
  "partnerWantsKids",
  "partnerHasKidsOk",
  "partnerEducation",
  "partnerHeightRangeCm",
  "partnerReligion",
  "partnerReligionRequired",
  "dealbreakers",
];

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
    key: "age",
    label: "Age they gave",
    // Where an age lands when there is no birth date. It is prose rather than
    // a field on purpose: "34" stops being true and nothing in the record
    // knows when it stopped, whereas a birth date is true for good. Matching
    // reads the birth date and only the birth date (`matches/rules.ts`), so
    // this note is for the matchmaker to read and to act on — by asking.
    policy: "agent",
    hint: "Only when no date of birth is on the record. Say when they said it.",
  },
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

/*
 * ─── What the profile agent is told, and what it says back ──────────────────
 *
 * The second half of extraction (prd/phase-2.md §4.1B). The conversation agent
 * has already noticed things in the thread, each with the candidate's own
 * words; this agent decides what, if anything, the registry can hold — and
 * whether each one is new, already known, or contradicts what is there.
 *
 * It does **not** decide whether a value is written or proposed. That is the
 * field's policy, applied by `applyAgentEntries`, and an agent that could
 * choose would make the policy advisory (prd/phase-2.md §4.1B).
 *
 * Plain code with no Convex imports, so what leaves this deployment is
 * readable in one file and unit-testable without a database.
 */

/** How one registry field is described to the agent. */
function fieldLine(field: CandidateFieldDef): string {
  const shape = valueShape(field.value);
  const hint = field.hint === undefined ? "" : ` — ${field.hint}`;
  return `- ${field.key} (${field.label}): ${shape}${hint}`;
}

/** What the agent is allowed to put in a field, in the words it must use. */
function valueShape(value: ProfileValueKind): string {
  switch (value.kind) {
    case "text":
      return `free text, up to ${value.maxLength} characters`;
    case "date":
      return "a date, written YYYY-MM-DD";
    case "integer":
      return `a whole number between ${value.min} and ${value.max}`;
    case "range":
      return `two numbers written "min-max", each between ${value.min} and ${value.max}`;
    case "choice":
      return `exactly one of: ${value.options.join(", ")}`;
    case "choices":
      return `any of, comma-separated: ${value.options.join(", ")}`;
    case "list":
      return `up to ${value.maxItems} comma-separated items`;
  }
}

/**
 * Every field and note this agent may touch, as the prompt lists them.
 *
 * **Fields the registry reserves for the matchmaker are left out entirely.**
 * Listing a field only to forbid it invites the model to reach for it, and a
 * value it emits for one is refused downstream anyway — spending output tokens
 * on something that can only be thrown away.
 */
export function registryCatalogue(): string {
  const groups = CANDIDATE_GROUP_ORDER.map((group) => {
    const fields = CANDIDATE_PROFILE_FIELDS.filter(
      (field) => field.group === group && field.policy !== "matchmaker",
    );
    if (fields.length === 0) return null;
    return `${CANDIDATE_GROUP_LABELS[group]}\n${fields.map(fieldLine).join("\n")}`;
  }).filter((block): block is string => block !== null);

  const notes = CANDIDATE_PROFILE_NOTES.filter(
    (note) => note.policy !== "matchmaker",
  ).map((note) => {
    const hint = note.hint === undefined ? "" : ` — ${note.hint}`;
    return `- ${note.key} (${note.label}): free text${hint}`;
  });

  return [
    `FIELDS — a value must be exactly the shape given\n${groups.join("\n\n")}`,
    `NOTES — a sentence or two in your own words\n${notes.join("\n")}`,
  ].join("\n\n");
}

/** One thing the conversation agent noticed, as this agent is shown it. */
export type NoticedInput = { observation: string; quote: string };

/** What is already on the record, as this agent is shown it. */
export type ProfileStateEntry = {
  kind: CandidateEntryKind;
  key: string;
  label: string;
  value: string;
  /** Whether a person typed it, which is what makes it untouchable. */
  byHand: boolean;
  /** Whether a proposal is already waiting on this field. */
  pending: boolean;
};

/**
 * The standing picture: who this is and what is already known about them.
 * Sent once per thread, because the thread is the memory.
 */
export function profileOpeningBrief(
  candidateName: string,
  state: ProfileStateEntry[],
): string {
  const parts = [
    `You are keeping ${candidateName}'s profile, in one matchmaker's book.`,
    registryCatalogue(),
  ];
  parts.push(
    state.length > 0
      ? `ALREADY ON ${candidateName.toUpperCase()}'S PROFILE\n${state.map(stateLine).join("\n")}`
      : `ALREADY ON ${candidateName.toUpperCase()}'S PROFILE\nNothing yet.`,
  );
  return parts.join("\n\n");
}

function stateLine(entry: ProfileStateEntry): string {
  const marks = [
    entry.byHand ? "typed by the matchmaker — never overwrite" : null,
    entry.pending ? "a suggestion is already waiting on this" : null,
  ].filter((mark): mark is string => mark !== null);
  const aside = marks.length === 0 ? "" : ` (${marks.join("; ")})`;
  return `- ${entry.kind}.${entry.key} — ${entry.label}: ${entry.value}${aside}`;
}

/**
 * What has changed on the record since this agent was last spoken to. Returns
 * `null` when nothing has, so a run adds no section rather than an empty one.
 */
export function profileUpdateBrief(
  changed: ProfileStateEntry[],
): string | null {
  if (changed.length === 0) return null;
  return `THE PROFILE HAS CHANGED SINCE YOU LAST SAW IT\nThese are current; anything you were told earlier about the same entry is out of date.\n${changed.map(stateLine).join("\n")}`;
}

/**
 * The task for one run: here is what was just noticed, tell me what to store.
 *
 * Asked for as delimited lines rather than JSON, for the reason the drafting
 * instruction gives: every wrapper the model has to close correctly is another
 * way for a usable answer to arrive unusable.
 */
export function reconcileInstruction(
  candidateName: string,
  noticed: NoticedInput[],
  now: number,
): string {
  return [
    todayLine(now),
    "",
    `JUST NOTICED IN THE CONVERSATION WITH ${candidateName.toUpperCase()}`,
    noticed
      .map((item) => `- ${item.observation} | their words: "${item.quote}"`)
      .join("\n"),
    "",
    "For each one, decide whether it belongs on the profile, and where. Then write one line per entry you want stored:",
    "<facts or notes> | <key from the lists above> | <the value, or CLEAR to empty it> | <confidence 0 to 1> | <their exact words>",
    "",
    "For example:",
    "facts | wantsKids | yes | 0.9 | I'd love a couple of kids one day",
    "notes | hobbies | Runs, and is training for a half marathon. | 0.8 | I'm up to 15k on my long run",
    "",
    "Rules:",
    "- Only keys from the lists above. A key that is not there is not a key.",
    "- A field's value must be exactly the shape its line gives. A number means digits, a choice means one of the words offered.",
    '- A date they gave relative to today — "my birthday\'s tomorrow", "I turned 40 last March" — is resolved against the date above and written out in full.',
    "- An age is not a date of birth. If they tell you how old they are, write it to notes.age and say when they said it; only write facts.dateOfBirth when they have given you an actual birth date, and never work one back from an age.",
    `- Say nothing about what is already on the profile and has not changed. Repeating it is the one thing that wastes ${candidateName}'s matchmaker's attention.`,
    "- CLEAR only when they have said something that makes the stored value untrue, never because they stopped mentioning it.",
    "- The exact words must be copied character for character from something they said. If you cannot quote it, do not write the line.",
    "- Confidence is yours and it is read: say 0.5 when you are half sure rather than rounding up.",
    "- If nothing here belongs on the profile, reply with the single word NOTHING.",
  ].join("\n");
}

/** One entry the profile agent wants stored, before anything validates it. */
export type ReconciledEntry = {
  kind: CandidateEntryKind;
  key: string;
  /** Absent for a clear. */
  value?: string;
  confidence?: number;
  quote: string;
};

/** How many entries one run may apply, however many the model writes. */
export const MAX_RECONCILED = 12;

/**
 * The entries, out of the delimited lines the model was asked for.
 *
 * **A malformed line is skipped, not fatal.** One bad line among five good
 * ones is a bad generation, not a bad batch, and `applyAgentEntries` takes the
 * same view of a value the registry refuses.
 *
 * The quote is everything after the fourth delimiter, so a quote containing a
 * `|` survives. A *value* containing one does not — a free-text note is the
 * only place that could happen, and losing an occasional note is a better
 * trade than a format a model gets wrong more often.
 */
export function parseReconciled(text: string): ReconciledEntry[] {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "NOTHING") return [];

  const entries: ReconciledEntry[] = [];
  for (const line of trimmed.split("\n")) {
    const bare = line.trim().replace(/^[-*•]\s*/, "");
    if (bare === "" || bare.toUpperCase() === "NOTHING") continue;

    const parts = bare.split("|");
    if (parts.length < 5) continue;

    const kind = parts[0]?.trim().toLowerCase();
    if (kind !== "facts" && kind !== "notes") continue;
    const key = parts[1]?.trim() ?? "";
    if (key === "") continue;

    const rawValue = parts[2]?.trim() ?? "";
    const quote = unquote(parts.slice(4).join("|").trim());
    if (quote === "") continue;

    const confidence = Number(parts[3]?.trim());
    entries.push({
      kind,
      key,
      value: rawValue.toUpperCase() === "CLEAR" ? undefined : rawValue,
      confidence:
        Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
          ? confidence
          : undefined,
      quote,
    });
    if (entries.length === MAX_RECONCILED) break;
  }
  return entries;
}

/** A model that wrapped a value or a quote in quotation marks. */
function unquote(raw: string): string {
  const quoted =
    raw.length > 1 &&
    ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("“") && raw.endsWith("”")));
  return (quoted ? raw.slice(1, -1) : raw).trim();
}
