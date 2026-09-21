/**
 * The match board's vocabulary and the whole matching algorithm (prd/phase-3.md
 * §2, §4, §5).
 *
 * ─── Deterministic, on purpose ──────────────────────────────────────────────
 *
 * The PRD's pipeline is "hard filter on facts → AI compatibility reasoning".
 * This is the first half, and it is the whole of it for now: every card on the
 * board is produced by the code below, from the normalised facts in
 * `candidateProfiles`, with no model anywhere. A matchmaker can therefore be
 * told exactly why two people are on a card together, and the same book scored
 * twice gives the same answer twice.
 *
 * Three rules hold the thing together:
 *
 *  1. **Missing data never disqualifies.** A blank field is something nobody
 *     has recorded yet, not a "no". A filter that fires on absence would hide
 *     the pairs a half-filled book is most likely to be wrong about.
 *  2. **Every score is symmetric.** A pair is unordered (`pairKey`), so
 *     `score(a, b)` has to equal `score(b, a)`. One-sided preferences —
 *     "a partner having children is fine" — are evaluated in both directions
 *     and averaged (`bothWays`).
 *  3. **A score is only as good as its coverage.** Two empty profiles agree
 *     about everything. So a score is the weighted mean over the signals that
 *     *could* be evaluated, and `coverage` says how much of the possible
 *     weight that was. A card needs both a score and a coverage to be
 *     suggested.
 *
 * Plain code with no Convex imports, exported through `@repo/api`, so the board
 * renders exactly the reasoning the run recorded.
 */

import { candidateField } from "../candidateProfiles/rules";
import { ageFromDateOfBirth, displayValue } from "../profiles/rules";

/*
 * ─── The board ──────────────────────────────────────────────────────────────
 */

export const MATCH_STAGES = [
  "proposed",
  "introduced",
  "connected",
  "closed",
] as const;

export type MatchStage = (typeof MATCH_STAGES)[number];

/**
 * The three columns, left to right.
 *
 * Each one is something that *happened between two people*, which is why
 * there are three of them and not six. A column for "I am thinking about it"
 * and a column for "they both said yes" describe the matchmaker's state of
 * mind and a fact already implied by the next column; a card had to be dragged
 * through both of them to say nothing anyone could act on.
 *
 * `closed` is not a column. A match that has ended — well or badly — leaves
 * the board (prd/phase-3.md §2).
 */
export const MATCH_BOARD_STAGES: readonly MatchStage[] = [
  "proposed",
  "introduced",
  "connected",
];

export const MATCH_STAGE_LABELS: Record<MatchStage, string> = {
  proposed: "Proposed",
  introduced: "Introduced",
  connected: "Connected",
  closed: "Closed",
};

/** What a column is for, under its heading. */
export const MATCH_STAGE_DESCRIPTIONS: Record<MatchStage, string> = {
  // "Proposed", not "Suggested": a matchmaker's own pairing lands here too,
  // and being told their idea was "suggested" to them reads like the machine
  // taking the credit.
  proposed: "Found by the nightly run, or paired by you.",
  introduced: "You've shown each of them the other, one at a time.",
  connected: "You've put the two of them in touch.",
  closed: "Over, one way or the other.",
};

export function isMatchStage(value: string): value is MatchStage {
  return (MATCH_STAGES as readonly string[]).includes(value);
}

/*
 * ─── How a match ends ───────────────────────────────────────────────────────
 *
 * Every match ends, and the two ways it can end are the same *event*: a
 * matchmaker saying this is over and saying what happened. So there is one
 * closed stage carrying an outcome, rather than a Rejected lane at one end of
 * the board and a "married" column at the other.
 *
 * Two outcomes and a note. Enough structure to count — "three together this
 * year" is a sentence a matchmaker should be able to read off their own board
 * — and not enough to make somebody choose between five shades of no.
 */

export const MATCH_OUTCOMES = ["together", "didnt_work"] as const;

export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

export const MATCH_OUTCOME_LABELS: Record<MatchOutcome, string> = {
  together: "They're together",
  didnt_work: "It didn't work",
};

/** The shorter form, for a badge on a closed card. */
export const MATCH_OUTCOME_BADGES: Record<MatchOutcome, string> = {
  together: "Together",
  didnt_work: "Didn't work",
};

/**
 * Who ended it. Meaningful on `didnt_work`, where *whose* no it was is the
 * taste signal the board exists to collect; a match that ended with the two of
 * them together wasn't ended by anybody.
 *
 * `system` is the nightly run taking back its own suggestion after a profile
 * changed under it — the one ending nobody chose, and worth telling apart from
 * the three that somebody did.
 */
export type MatchClosedBy =
  | "matchmaker"
  | "candidateA"
  | "candidateB"
  // Neither of them wanted it, which is a different fact from either of them
  // not wanting it — and the commonest way an introduction quietly ends.
  | "both"
  | "system";

export const MATCH_CLOSED_BY_LABELS: Record<MatchClosedBy, string> = {
  matchmaker: "You",
  candidateA: "First candidate",
  candidateB: "Second candidate",
  both: "Both of them",
  system: "The nightly run",
};

/** The four a person can pick. `system` is the run's own word. */
export const MATCH_CLOSED_BY_CHOICES: readonly MatchClosedBy[] = [
  "matchmaker",
  "candidateA",
  "candidateB",
  "both",
];

export const MATCH_LIMITS = {
  /** What happened, written when a match is closed. A note, not a case file. */
  closingNote: 500,
  /**
   * New cards one book may gain in one run. A matchmaker who opens the board
   * to ninety suggestions has been handed a list, not a shortlist.
   */
  newPerRun: 20,
  /** A pair below this scores too low to be worth a card. */
  minScore: 50,
  /**
   * And below this there isn't enough profile to trust the score at all — two
   * fields agreeing is not a match, it's a coincidence.
   */
  minCoverage: 0.35,
  /**
   * Closed cards the board fetches behind its summary line. They are out of
   * the way rather than out of reach, so nothing has to age out of view — and
   * the reason a match ended is the one thing worth keeping of it.
   */
  closedShown: 100,
  /** Candidates one run reads from a book. Far above a phase-1 book. */
  book: 300,
  /** Books one night's fan-out covers. One scheduled job each. */
  booksPerRun: 1_000,
  /** Existing cards one run reads for a book. */
  boardCards: 2_000,
  /** Cards one column shows before the board asks you to move some on. */
  cardsPerColumn: 100,
  /**
   * Cards the candidate panel carries for one person. A carousel with more
   * than this behind it is not a carousel any more, and the board is where
   * somebody goes to see all of them.
   */
  cardsPerCandidate: 20,
} as const;

/**
 * Bumped whenever the weights or filters below change. Stored on every card,
 * so a score from an older version is visible as one rather than silently
 * compared against a new one.
 */
export const MATCH_ALGORITHM_VERSION = 1;

/*
 * ─── A pair ─────────────────────────────────────────────────────────────────
 *
 * A match is between two people, not from one to another: "Sam and Jordan" is
 * one card however it was found. The pair is stored with its ids sorted, and
 * `pairKey` is the unique thing a run checks before making a card — which is
 * how the second night doesn't suggest the same two people again.
 */

/** The two ids in their fixed order. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function pairKey(a: string, b: string): string {
  const [low, high] = orderedPair(a, b);
  return `${low}:${high}`;
}

/*
 * ─── Reading facts ──────────────────────────────────────────────────────────
 *
 * A profile's `facts` as the algorithm sees them: the normalised strings and
 * nothing else. Who wrote a value and when doesn't change whether two people
 * fit, so the scorers never see it.
 */

export type ProfileFacts = Record<string, string>;

function fact(facts: ProfileFacts, key: string): string | null {
  const value = facts[key];
  return value === undefined || value === "" ? null : value;
}

/** A fact as a person reads it, for the `detail` line on a card. */
function readable(key: string, value: string): string {
  const field = candidateField(key);
  return field === null ? value : displayValue(field, value);
}

/**
 * Their age, read off their birth date and nowhere else.
 *
 * There used to be an `age` fact to fall back on, and it was the wrong shape
 * for a record that outlives the conversation it came from: "34" is true for
 * one year and nothing stored beside it knows which one. So an age a candidate
 * mentions is now prose in `notes.age`, and a pair with no birth date between
 * them simply scores nothing on this signal rather than scoring on a number
 * that quietly aged (`candidateProfiles/rules.ts`).
 */
export function ageOf(facts: ProfileFacts, now: number): number | null {
  const born = fact(facts, "dateOfBirth");
  return born === null ? null : ageFromDateOfBirth(born, now);
}

/** `"28-36"` → `[28, 36]`. */
function range(facts: ProfileFacts, key: string): [number, number] | null {
  const value = fact(facts, key);
  if (value === null) return null;
  const [low, high] = value.split("-").map(Number);
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null;
}

function number(facts: ProfileFacts, key: string): number | null {
  const value = fact(facts, key);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A `list` or `choices` fact as its items. */
function items(facts: ProfileFacts, key: string): string[] {
  const value = fact(facts, key);
  if (value === null) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

/*
 * ─── Who is looking for whom ────────────────────────────────────────────────
 */

/** The `seekingGender` term that names someone of this gender. */
function genderTerm(gender: string): string | null {
  switch (gender) {
    case "woman":
      return "women";
    case "man":
      return "men";
    case "non-binary":
      return "non-binary people";
    default:
      // "other": nothing in the registry's vocabulary names them except
      // "anyone", and guessing on someone's behalf here is exactly the kind of
      // guess this file exists to avoid.
      return null;
  }
}

/**
 * Who they are looking for, as `seekingGender` terms.
 *
 * `seekingGender` when it is recorded. When it isn't, orientation and gender
 * together imply it for the unambiguous cases, and that inference is the only
 * one in this file: a straight woman is looking for men, and a book where
 * nobody has filled in `seekingGender` would otherwise pair her with one of
 * them at random. Bisexual, pansexual and queer imply nothing narrower than
 * "anyone"; asexual and "other" imply nothing at all, and return `null` —
 * unknown, which never disqualifies.
 */
export function seekingTerms(facts: ProfileFacts): Set<string> | null {
  const stated = items(facts, "seekingGender");
  if (stated.length > 0) return new Set(stated);

  const orientation = fact(facts, "orientation");
  const gender = fact(facts, "gender");
  if (orientation === null || gender === null) return null;

  switch (orientation) {
    case "straight":
      if (gender === "woman") return new Set(["men"]);
      if (gender === "man") return new Set(["women"]);
      return null;
    case "gay":
      return gender === "woman" ? new Set(["women"]) : new Set(["men"]);
    case "lesbian":
      return new Set(["women"]);
    case "bisexual":
    case "pansexual":
    case "queer":
      return new Set(["anyone"]);
    default:
      return null;
  }
}

/** Whether `seeking` covers someone whose gender is `gender`. */
function seeks(seeking: Set<string>, gender: string): boolean {
  if (seeking.has("anyone")) return true;
  const term = genderTerm(gender);
  return term !== null && seeking.has(term);
}

/*
 * ─── The hard filters ───────────────────────────────────────────────────────
 *
 * A blocker is a stated "no", never an absence. Each one fires only when both
 * halves of it are on the record, and each is mutual: the pair fails if it
 * fails in either direction.
 */

export type MatchBlocker = {
  /** Which filter. Stable, so it can be counted across runs. */
  key: string;
  /** The specific reason, as a person reads it. */
  detail: string;
};

const NAME_A = "One of them";
const NAME_B = "The other";

export function hardBlockers(
  a: ProfileFacts,
  b: ProfileFacts,
  now: number = Date.now(),
): MatchBlocker[] {
  const blockers: MatchBlocker[] = [];
  const add = (key: string, detail: string) => blockers.push({ key, detail });

  // Who they're looking for.
  const seekingA = seekingTerms(a);
  const seekingB = seekingTerms(b);
  const genderA = fact(a, "gender");
  const genderB = fact(b, "gender");
  if (seekingA !== null && genderB !== null && !seeks(seekingA, genderB)) {
    add(
      "seeking",
      `${NAME_A} isn't looking for ${genderTerm(genderB) ?? genderB}.`,
    );
  }
  if (seekingB !== null && genderA !== null && !seeks(seekingB, genderA)) {
    add(
      "seeking",
      `${NAME_B} isn't looking for ${genderTerm(genderA) ?? genderA}.`,
    );
  }

  // Age, against each side's stated range.
  const ageA = ageOf(a, now);
  const ageB = ageOf(b, now);
  const wantsAgeA = range(a, "partnerAgeRange");
  const wantsAgeB = range(b, "partnerAgeRange");
  if (wantsAgeA !== null && ageB !== null && outside(wantsAgeA, ageB)) {
    add(
      "partnerAgeRange",
      `${ageB} is outside ${wantsAgeA[0]}–${wantsAgeA[1]}.`,
    );
  }
  if (wantsAgeB !== null && ageA !== null && outside(wantsAgeB, ageA)) {
    add(
      "partnerAgeRange",
      `${ageA} is outside ${wantsAgeB[0]}–${wantsAgeB[1]}.`,
    );
  }

  // Height, the same way.
  const heightA = number(a, "heightCm");
  const heightB = number(b, "heightCm");
  const wantsHeightA = range(a, "partnerHeightRangeCm");
  const wantsHeightB = range(b, "partnerHeightRangeCm");
  if (
    wantsHeightA !== null &&
    heightB !== null &&
    outside(wantsHeightA, heightB)
  ) {
    add(
      "partnerHeightRangeCm",
      `${heightB}cm is outside ${wantsHeightA[0]}–${wantsHeightA[1]}cm.`,
    );
  }
  if (
    wantsHeightB !== null &&
    heightA !== null &&
    outside(wantsHeightB, heightA)
  ) {
    add(
      "partnerHeightRangeCm",
      `${heightA}cm is outside ${wantsHeightB[0]}–${wantsHeightB[1]}cm.`,
    );
  }

  // Children. Only the registry's own word — "dealbreaker" — is hard; a
  // partner who *should* want children is a preference, and scores as one.
  for (const [self, other, name] of pairs(a, b)) {
    if (
      fact(self, "partnerWantsKids") === "dealbreaker" &&
      fact(other, "wantsKids") === "no"
    ) {
      add(
        "partnerWantsKids",
        `${name} won't consider someone who doesn't want children.`,
      );
    }
    if (
      fact(self, "partnerHasKidsOk") === "no" &&
      fact(other, "hasKids") === "yes"
    ) {
      add(
        "partnerHasKidsOk",
        `${name} won't consider someone who has children.`,
      );
    }
    // A required shared religion, against the religion they named for a
    // partner if they named one, otherwise their own.
    if (fact(self, "partnerReligionRequired") === "yes") {
      const required = fact(self, "partnerReligion") ?? fact(self, "religion");
      const theirs = fact(other, "religion");
      if (required !== null && theirs !== null && !sameText(required, theirs)) {
        add(
          "partnerReligionRequired",
          `${name} needs a shared religion — ${required}, not ${theirs}.`,
        );
      }
    }
  }

  return blockers;
}

function outside([low, high]: [number, number], value: number): boolean {
  return value < low || value > high;
}

/** Both directions of a one-sided preference, with a name for each side. */
function pairs(
  a: ProfileFacts,
  b: ProfileFacts,
): [ProfileFacts, ProfileFacts, string][] {
  return [
    [a, b, NAME_A],
    [b, a, NAME_B],
  ];
}

function sameText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/*
 * ─── The score ──────────────────────────────────────────────────────────────
 */

export type MatchSignal = {
  /** Which signal. `MATCH_SIGNAL_LABELS` names it. */
  key: string;
  /** How much this signal is worth relative to the others. */
  weight: number;
  /** 0..1 — how much of that weight the pair earned. */
  earned: number;
  /** What the run actually saw, e.g. "Both want marriage". */
  detail: string;
};

export const MATCH_SIGNAL_LABELS: Record<string, string> = {
  lookingFor: "What they want",
  age: "Ages",
  location: "Where they are",
  wantsKids: "Children",
  hasKids: "Existing children",
  religion: "Religion",
  religionImportance: "How much religion matters",
  politics: "Politics",
  languages: "Languages",
  education: "Education",
  smoking: "Smoking",
  drinking: "Drinking",
  drugs: "Recreational drugs",
  diet: "Diet",
  exercise: "Exercise",
  familyImportance: "How much family matters",
  relocation: "Relocating",
};

export function matchSignalLabel(key: string): string {
  return MATCH_SIGNAL_LABELS[key] ?? key;
}

/** What a signal added to the score, for ordering the reasons on a card. */
export function signalContribution(signal: MatchSignal): number {
  return signal.earned * signal.weight;
}

/**
 * The signals a card leads with: the strongest few, then the weakest one if it
 * is genuinely weak. A card that lists only what agrees is a card that lies by
 * omission — the thing a matchmaker most needs to see is the one axis where
 * two otherwise promising people don't line up.
 */
export function topSignals(
  signals: readonly MatchSignal[],
  limit = 3,
): MatchSignal[] {
  const ranked = [...signals].sort(
    (left, right) => signalContribution(right) - signalContribution(left),
  );
  const best = ranked.slice(0, limit);
  const worst = ranked[ranked.length - 1];
  if (worst !== undefined && !best.includes(worst) && worst.earned <= 0.25) {
    return [...best.slice(0, limit - 1), worst];
  }
  return best;
}

/** One signal's verdict, or `null` where the facts for it aren't there. */
type Verdict = { earned: number; detail: string } | null;

type Scorer = {
  key: string;
  weight: number;
  score: (a: ProfileFacts, b: ProfileFacts, now: number) => Verdict;
};

/**
 * A one-sided preference, scored in both directions and averaged, so the
 * result doesn't depend on which of the two people the pair happens to be
 * stored under. A direction nobody has recorded is left out of the average
 * rather than counted as a zero.
 */
function bothWays(
  one: (self: ProfileFacts, other: ProfileFacts) => Verdict,
): (a: ProfileFacts, b: ProfileFacts) => Verdict {
  return (a, b) => {
    const forward = one(a, b);
    const back = one(b, a);
    if (forward === null) return back;
    if (back === null) return forward;
    return {
      earned: (forward.earned + back.earned) / 2,
      detail:
        forward.earned === back.earned
          ? forward.detail
          : `${forward.detail} ${back.detail}`,
    };
  };
}

/**
 * How close two values are on an ordered scale: same → 1, the two ends → 0.
 *
 * The scales below are the algorithm's own, not the registry's option order.
 * `smoking` is the reason why: the registry lists "never, socially, regularly,
 * quitting" because that is the order a person reads them in, but someone
 * quitting sits next to "never" on the only line that matters here.
 */
function closeness(
  scale: readonly string[],
  left: string,
  right: string,
): number {
  const from = scale.indexOf(left);
  const to = scale.indexOf(right);
  if (from === -1 || to === -1) return 0;
  return 1 - Math.abs(from - to) / (scale.length - 1);
}

/** A signal that compares one `choice` fact on an ordered scale. */
function scaleSignal(
  key: string,
  weight: number,
  scale: readonly string[],
): Scorer {
  return {
    key,
    weight,
    score: (a, b) => {
      const left = fact(a, key);
      const right = fact(b, key);
      if (left === null || right === null) return null;
      const earned = closeness(scale, left, right);
      return {
        earned,
        detail:
          left === right
            ? `Both ${readable(key, left)}`
            : `${readable(key, left)} and ${readable(key, right)}`,
      };
    },
  };
}

const IMPORTANCE_SCALE = ["low", "medium", "high"] as const;
const SMOKING_SCALE = ["never", "quitting", "socially", "regularly"] as const;
const FREQUENCY_SCALE = ["never", "socially", "regularly"] as const;
const EXERCISE_SCALE = ["rarely", "sometimes", "often", "daily"] as const;
const EDUCATION_SCALE = [
  "school",
  "vocational",
  "undergraduate",
  "postgraduate",
  "doctorate",
] as const;

/** How much of each other's `lookingFor` two people share. */
const LOOKING_FOR_AFFINITY: Record<string, Record<string, number>> = {
  marriage: { marriage: 1, "long-term": 0.6, companionship: 0.2, unsure: 0.35 },
  "long-term": {
    marriage: 0.6,
    "long-term": 1,
    companionship: 0.45,
    unsure: 0.5,
  },
  companionship: {
    marriage: 0.2,
    "long-term": 0.45,
    companionship: 1,
    unsure: 0.5,
  },
  unsure: { marriage: 0.35, "long-term": 0.5, companionship: 0.5, unsure: 0.5 },
};

/** And of each other's `wantsKids`. */
const WANTS_KIDS_AFFINITY: Record<string, Record<string, number>> = {
  yes: { yes: 1, no: 0, maybe: 0.5, open: 0.7 },
  no: { yes: 0, no: 1, maybe: 0.4, open: 0.5 },
  maybe: { yes: 0.5, no: 0.4, maybe: 0.8, open: 0.8 },
  open: { yes: 0.7, no: 0.5, maybe: 0.8, open: 0.9 },
};

/**
 * Every soft signal, with what it is worth.
 *
 * The weights are a judgement about matchmaking, not a fact about it: what
 * someone is looking for, where they are and whether they want children carry
 * three times what their exercise habit does. They are all in one list so that
 * disagreeing with them is an edit to a number.
 */
const SCORERS: readonly Scorer[] = [
  {
    key: "lookingFor",
    weight: 6,
    score: (a, b) => {
      const left = fact(a, "lookingFor");
      const right = fact(b, "lookingFor");
      if (left === null || right === null) return null;
      const earned = LOOKING_FOR_AFFINITY[left]?.[right] ?? 0;
      return {
        earned,
        detail:
          left === right
            ? `Both want ${left === "unsure" ? "to see" : left.replace("-", " ")}`
            : `${readable("lookingFor", left)} and ${readable("lookingFor", right)}`,
      };
    },
  },
  {
    key: "wantsKids",
    weight: 6,
    score: (a, b) => {
      const left = fact(a, "wantsKids");
      const right = fact(b, "wantsKids");
      if (left === null || right === null) return null;
      const earned = WANTS_KIDS_AFFINITY[left]?.[right] ?? 0;
      return {
        earned,
        detail:
          left === right
            ? `Both ${left === "yes" ? "want children" : left === "no" ? "don't want children" : `are ${left} about children`}`
            : `Children: ${left} and ${right}`,
      };
    },
  },
  {
    key: "location",
    weight: 6,
    score: (a, b) => {
      const cityA = fact(a, "locationCity");
      const cityB = fact(b, "locationCity");
      const countryA = fact(a, "locationCountry");
      const countryB = fact(b, "locationCountry");
      if (cityA !== null && cityB !== null && sameText(cityA, cityB)) {
        return { earned: 1, detail: `Both in ${cityA}` };
      }
      if (countryA === null || countryB === null) {
        // One city each and nothing else: different cities, and no way to know
        // how far apart. Worth something, and not worth much.
        if (cityA === null || cityB === null) return null;
        return { earned: 0.3, detail: `${cityA} and ${cityB}` };
      }
      if (sameText(countryA, countryB)) {
        const where =
          cityA !== null && cityB !== null ? `${cityA} and ${cityB}` : countryA;
        return { earned: 0.6, detail: `${where}, same country` };
      }
      const moving = [a, b]
        .map((facts) => fact(facts, "willingToRelocate"))
        .filter((value) => value !== null);
      const earned = moving.includes("yes")
        ? 0.4
        : moving.includes("maybe")
          ? 0.25
          : 0.1;
      return { earned, detail: `${countryA} and ${countryB}` };
    },
  },
  {
    key: "hasKids",
    weight: 4,
    score: bothWays((self, other) => {
      const theirs = fact(other, "hasKids");
      if (theirs !== "yes") return null;
      const fine = fact(self, "partnerHasKidsOk");
      if (fine === null) return null;
      const earned = fine === "yes" ? 1 : fine === "maybe" ? 0.5 : 0;
      return {
        earned,
        detail: `Children already: ${fine === "yes" ? "fine with them" : fine}`,
      };
    }),
  },
  {
    key: "religion",
    weight: 4,
    score: (a, b) => {
      const left = fact(a, "religion");
      const right = fact(b, "religion");
      if (left === null || right === null) return null;
      if (sameText(left, right)) return { earned: 1, detail: `Both ${left}` };
      // Different religions matter as much as the two of them say they do.
      const importance = [a, b]
        .map((facts) => fact(facts, "religionImportance"))
        .filter((value): value is string => value !== null);
      const earned = importance.includes("high")
        ? 0
        : importance.includes("medium")
          ? 0.35
          : 0.6;
      return { earned, detail: `${left} and ${right}` };
    },
  },
  {
    key: "politics",
    weight: 2,
    score: (a, b) => {
      const left = fact(a, "politics");
      const right = fact(b, "politics");
      if (left === null || right === null) return null;
      if (sameText(left, right)) return { earned: 1, detail: `Both ${left}` };
      const importance = [a, b]
        .map((facts) => fact(facts, "politicsImportance"))
        .filter((value): value is string => value !== null);
      const earned = importance.includes("high")
        ? 0.1
        : importance.includes("medium")
          ? 0.45
          : 0.7;
      return { earned, detail: `${left} and ${right}` };
    },
  },
  {
    key: "age",
    weight: 3,
    score: (a, b, now) => {
      const left = ageOf(a, now);
      const right = ageOf(b, now);
      if (left === null || right === null) return null;
      const gap = Math.abs(left - right);
      const earned =
        gap <= 3
          ? 1
          : gap <= 6
            ? 0.8
            : gap <= 10
              ? 0.55
              : gap <= 15
                ? 0.3
                : 0.1;
      return {
        earned,
        detail:
          gap === 0
            ? `Both ${left}`
            : `${left} and ${right} — ${gap} year${gap === 1 ? "" : "s"} apart`,
      };
    },
  },
  {
    key: "languages",
    weight: 3,
    score: (a, b) => {
      const left = items(a, "languages");
      const right = items(b, "languages");
      if (left.length === 0 || right.length === 0) return null;
      const shared = left.filter((language) => right.includes(language));
      if (shared.length === 0) {
        return { earned: 0, detail: "No language in common on record" };
      }
      return {
        earned: 1,
        detail: `Both speak ${shared.join(", ")}`,
      };
    },
  },
  {
    key: "education",
    weight: 2,
    score: (a, b) => {
      // Each side's stated preference first: the registry's `partnerEducation`
      // is a floor, not a likeness.
      const preference = bothWays((self, other) => {
        const wanted = fact(self, "partnerEducation");
        const theirs = fact(other, "education");
        if (wanted === null || wanted === "no-preference" || theirs === null)
          return null;
        const met =
          EDUCATION_SCALE.indexOf(theirs as (typeof EDUCATION_SCALE)[number]) >=
          EDUCATION_SCALE.indexOf(wanted as (typeof EDUCATION_SCALE)[number]);
        return {
          earned: met ? 1 : 0.2,
          detail: met
            ? `${wanted} or above, as asked`
            : `Wanted ${wanted}, has ${theirs}`,
        };
      })(a, b);
      if (preference !== null) return preference;
      return scaleSignal("education", 2, EDUCATION_SCALE).score(a, b, 0);
    },
  },
  scaleSignal("smoking", 4, SMOKING_SCALE),
  scaleSignal("drinking", 3, FREQUENCY_SCALE),
  scaleSignal("drugs", 2, FREQUENCY_SCALE),
  scaleSignal("exercise", 2, EXERCISE_SCALE),
  scaleSignal("familyImportance", 2, IMPORTANCE_SCALE),
  scaleSignal("religionImportance", 2, IMPORTANCE_SCALE),
  {
    key: "diet",
    weight: 2,
    score: (a, b) => {
      const left = fact(a, "diet");
      const right = fact(b, "diet");
      if (left === null || right === null) return null;
      if (left === right) return { earned: 1, detail: `Both ${left}` };
      // A diet that is a rule rather than a preference is the one that makes a
      // shared table hard.
      const observant = new Set(["vegan", "halal", "kosher", "vegetarian"]);
      const earned = observant.has(left) !== observant.has(right) ? 0.35 : 0.7;
      return { earned, detail: `${left} and ${right}` };
    },
  },
];

/** The most any pair could earn, if every fact in the registry were recorded. */
const TOTAL_WEIGHT = SCORERS.reduce((sum, scorer) => sum + scorer.weight, 0);

export type PairVerdict =
  | { ok: false; blockers: MatchBlocker[] }
  | {
      ok: true;
      /** 0..100, the weighted mean over the signals that could be read. */
      score: number;
      /** 0..1, how much of the possible weight that mean is based on. */
      coverage: number;
      signals: MatchSignal[];
      /**
       * Either of them has written a free-text dealbreaker. No algorithm reads
       * those, so the card says as much rather than implying they were checked.
       */
      checkDealbreakers: boolean;
    };

/**
 * Whether two people could be introduced, and how well they fit.
 *
 * Deterministic and symmetric: `evaluatePair(a, b)` is `evaluatePair(b, a)`,
 * and the same facts give the same number every time.
 */
export function evaluatePair(
  a: ProfileFacts,
  b: ProfileFacts,
  now: number = Date.now(),
): PairVerdict {
  const blockers = hardBlockers(a, b, now);
  if (blockers.length > 0) return { ok: false, blockers };

  const signals: MatchSignal[] = [];
  let earnedWeight = 0;
  let possibleWeight = 0;
  for (const scorer of SCORERS) {
    const verdict = scorer.score(a, b, now);
    if (verdict === null) continue;
    signals.push({
      key: scorer.key,
      weight: scorer.weight,
      earned: round(verdict.earned, 2),
      detail: verdict.detail,
    });
    earnedWeight += verdict.earned * scorer.weight;
    possibleWeight += scorer.weight;
  }

  return {
    ok: true,
    score:
      possibleWeight === 0
        ? 0
        : Math.round((earnedWeight / possibleWeight) * 100),
    coverage: round(possibleWeight / TOTAL_WEIGHT, 3),
    signals,
    checkDealbreakers:
      fact(a, "dealbreakers") !== null || fact(b, "dealbreakers") !== null,
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** A pair that passed the hard filters, and so has a score. */
export type ScoredPair = Extract<PairVerdict, { ok: true }>;

/*
 * Deliberately not a `verdict is ScoredPair` type guard: a pair can pass every
 * filter and still score too low, so "not suggestable" does not mean "blocked",
 * and a guard would have the compiler believing it does.
 */

/**
 * Whether a verdict is good enough to put on the board unasked.
 *
 * Both halves matter. The score says the pair fits; the coverage says there was
 * enough recorded to mean it. A nightly run that suggested every pair of
 * half-empty profiles would teach a matchmaker to stop opening the board.
 */
export function isSuggestable(verdict: PairVerdict): boolean {
  return (
    verdict.ok &&
    verdict.score >= MATCH_LIMITS.minScore &&
    verdict.coverage >= MATCH_LIMITS.minCoverage
  );
}

/** How a score reads next to its coverage: "72, on a well-filled profile". */
export function coverageLabel(coverage: number): string {
  if (coverage >= 0.7) return "on a full profile";
  if (coverage >= 0.5) return "on most of a profile";
  if (coverage >= MATCH_LIMITS.minCoverage) return "on a partial profile";
  return "on very little";
}

/*
 * ─── Moving a card ──────────────────────────────────────────────────────────
 */

/**
 * Why a stage change is refused, or `null`. Deliberately permissive: a
 * matchmaker knows what happened between two people better than a state
 * machine does, so a card goes anywhere except nowhere. The one thing that
 * isn't a move is moving a card to the column it is already in.
 *
 * Closing is not here: it carries an outcome and a note, and goes through
 * `matches.mutations.close` instead. Moving a card *out* of closed is an
 * ordinary move, and clears what closing recorded — a match that is back on
 * the board is not one that ended.
 */
export function stageChangeError(
  from: MatchStage,
  to: MatchStage,
): string | null {
  if (from === to) return "It's already there.";
  if (to === "closed") {
    return "Ending a match records what happened — use Close.";
  }
  return null;
}

/**
 * Why a closing note can't be saved, or `null`.
 *
 * Required when it didn't work, because *why* is the whole of what the board
 * learns from a match that failed. Optional when they're together: the outcome
 * has already said the thing worth saying, and making somebody write a
 * sentence about good news is how good news stops getting recorded.
 */
export function closingNoteError(
  outcome: MatchOutcome,
  raw: string,
): string | null {
  const note = raw.trim();
  if (!note) {
    return outcome === "didnt_work"
      ? "Say why, even briefly — it's the taste signal."
      : null;
  }
  return note.length > MATCH_LIMITS.closingNote
    ? `Keep it under ${MATCH_LIMITS.closingNote} characters.`
    : null;
}

/** Whether closing this way needs somebody to have ended it. */
export function closingNeedsWho(outcome: MatchOutcome): boolean {
  return outcome === "didnt_work";
}
