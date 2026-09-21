import { describe, expect, test } from "vitest";
import {
  ageOf,
  closingNeedsWho,
  closingNoteError,
  coverageLabel,
  evaluatePair,
  hardBlockers,
  isSuggestable,
  MATCH_BOARD_STAGES,
  MATCH_LIMITS,
  MATCH_STAGES,
  type ProfileFacts,
  pairKey,
  seekingTerms,
  stageChangeError,
  topSignals,
} from "./rules";

/** 2026-09-21, so an age computed from a birth date is a fixed number. */
const NOW = Date.parse("2026-09-21T12:00:00Z");

/**
 * Two people who should match: same city, both want marriage and children,
 * each inside the other's stated ranges.
 */
const SAM: ProfileFacts = {
  age: "34",
  gender: "man",
  heightCm: "180",
  languages: "English, French",
  education: "postgraduate",
  locationCity: "Toronto",
  locationCountry: "Canada",
  lookingFor: "marriage",
  wantsKids: "yes",
  smoking: "never",
  drinking: "socially",
  exercise: "often",
  diet: "omnivore",
  religion: "none",
  religionImportance: "low",
  familyImportance: "high",
  seekingGender: "women",
  partnerAgeRange: "28-38",
};

const JORDAN: ProfileFacts = {
  age: "31",
  gender: "woman",
  heightCm: "168",
  languages: "English, Spanish",
  education: "undergraduate",
  locationCity: "Toronto",
  locationCountry: "Canada",
  lookingFor: "marriage",
  wantsKids: "yes",
  smoking: "never",
  drinking: "socially",
  exercise: "sometimes",
  diet: "omnivore",
  religion: "none",
  religionImportance: "low",
  familyImportance: "high",
  seekingGender: "men",
  partnerAgeRange: "30-42",
};

/** The same profile with a fact nobody ever recorded. */
function without(facts: ProfileFacts, ...keys: string[]): ProfileFacts {
  return Object.fromEntries(
    Object.entries(facts).filter(([key]) => !keys.includes(key)),
  );
}

function scored(a: ProfileFacts, b: ProfileFacts) {
  const verdict = evaluatePair(a, b, NOW);
  if (!verdict.ok) {
    throw new Error(
      `Expected a score, got blockers: ${verdict.blockers.map((x) => x.key)}`,
    );
  }
  return verdict;
}

describe("the board's vocabulary", () => {
  test("closed is not a column", () => {
    expect(MATCH_STAGES).toContain("closed");
    expect(MATCH_BOARD_STAGES).not.toContain("closed");
    expect(MATCH_BOARD_STAGES).toHaveLength(MATCH_STAGES.length - 1);
  });

  test("three columns, each of them something that happened", () => {
    expect(MATCH_BOARD_STAGES).toEqual(["proposed", "introduced", "connected"]);
  });

  test("a card goes anywhere except nowhere, and closes only through Close", () => {
    expect(stageChangeError("proposed", "connected")).toBeNull();
    expect(stageChangeError("connected", "introduced")).toBeNull();
    // Back onto the board from closed is an ordinary move.
    expect(stageChangeError("closed", "proposed")).toBeNull();
    expect(stageChangeError("proposed", "proposed")).not.toBeNull();
    expect(stageChangeError("introduced", "closed")).not.toBeNull();
  });

  test("a no needs a reason; a yes does not", () => {
    expect(closingNoteError("didnt_work", "")).not.toBeNull();
    expect(closingNoteError("didnt_work", "   ")).not.toBeNull();
    expect(
      closingNoteError("didnt_work", "She's moving to Berlin."),
    ).toBeNull();
    // Making somebody write a sentence about good news is how good news
    // stops getting recorded.
    expect(closingNoteError("together", "")).toBeNull();
    expect(closingNoteError("together", "Engaged in May.")).toBeNull();
    expect(
      closingNoteError("together", "x".repeat(MATCH_LIMITS.closingNote + 1)),
    ).not.toBeNull();
  });

  test("only a no has somebody who ended it", () => {
    expect(closingNeedsWho("didnt_work")).toBe(true);
    expect(closingNeedsWho("together")).toBe(false);
  });
});

describe("pairKey", () => {
  test("is the unordered pair", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
    expect(pairKey("a", "b")).toBe("a:b");
  });

  test("tells different pairs apart", () => {
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
  });
});

describe("reading facts", () => {
  test("a birth date beats a stated age", () => {
    expect(ageOf({ dateOfBirth: "1990-01-01", age: "12" }, NOW)).toBe(36);
    expect(ageOf({ age: "34" }, NOW)).toBe(34);
    expect(ageOf({}, NOW)).toBeNull();
  });

  test("an empty value is not a value", () => {
    expect(ageOf({ age: "" }, NOW)).toBeNull();
  });

  test("seeking comes from the fact, or from orientation where there isn't one", () => {
    expect(seekingTerms({ seekingGender: "women, men" })).toEqual(
      new Set(["women", "men"]),
    );
    expect(seekingTerms({ orientation: "straight", gender: "woman" })).toEqual(
      new Set(["men"]),
    );
    expect(seekingTerms({ orientation: "lesbian", gender: "woman" })).toEqual(
      new Set(["women"]),
    );
    expect(seekingTerms({ orientation: "bisexual", gender: "man" })).toEqual(
      new Set(["anyone"]),
    );
    // Nothing to infer, rather than a guess.
    expect(seekingTerms({ orientation: "asexual", gender: "man" })).toBeNull();
    expect(seekingTerms({ gender: "man" })).toBeNull();
    // The stated fact wins over an inference that contradicts it.
    expect(
      seekingTerms({
        orientation: "straight",
        gender: "man",
        seekingGender: "anyone",
      }),
    ).toEqual(new Set(["anyone"]));
  });
});

describe("the hard filters", () => {
  test("let a good pair through", () => {
    expect(hardBlockers(SAM, JORDAN, NOW)).toEqual([]);
  });

  test("are symmetric", () => {
    const facts = { ...JORDAN, partnerAgeRange: "25-30" };
    expect(hardBlockers(SAM, facts, NOW).map((b) => b.key)).toEqual(
      hardBlockers(facts, SAM, NOW).map((b) => b.key),
    );
  });

  test("never fire on a fact nobody recorded", () => {
    // The emptiest possible profile blocks nothing, in either direction.
    expect(hardBlockers({}, {}, NOW)).toEqual([]);
    expect(hardBlockers(SAM, { gender: "woman" }, NOW)).toEqual([]);
    expect(hardBlockers({ seekingGender: "women" }, {}, NOW)).toEqual([]);
  });

  test("block someone who isn't looking for the other's gender", () => {
    const blockers = hardBlockers(SAM, { ...JORDAN, gender: "man" }, NOW);
    expect(blockers.map((b) => b.key)).toContain("seeking");
  });

  test("block an age outside the stated range", () => {
    const tooYoung = { ...JORDAN, age: "24", partnerAgeRange: "30-42" };
    const blockers = hardBlockers(SAM, tooYoung, NOW);
    expect(blockers.map((b) => b.key)).toEqual(["partnerAgeRange"]);
    expect(blockers[0].detail).toContain("28–38");
  });

  test("read the age off a birth date, as the registry says", () => {
    const born = { ...without(JORDAN, "age"), dateOfBirth: "2005-01-01" };
    expect(hardBlockers(SAM, born, NOW).map((b) => b.key)).toEqual([
      "partnerAgeRange",
    ]);
  });

  test("block a height outside the stated range", () => {
    const wants = { ...SAM, partnerHeightRangeCm: "170-185" };
    expect(hardBlockers(wants, JORDAN, NOW).map((b) => b.key)).toEqual([
      "partnerHeightRangeCm",
    ]);
  });

  test("treat only the registry's own word as a children dealbreaker", () => {
    const noKids = { ...JORDAN, wantsKids: "no" };
    // "yes" is a preference: it scores badly and blocks nothing.
    expect(
      hardBlockers({ ...SAM, partnerWantsKids: "yes" }, noKids, NOW),
    ).toEqual([]);
    expect(
      hardBlockers(
        { ...SAM, partnerWantsKids: "dealbreaker" },
        noKids,
        NOW,
      ).map((b) => b.key),
    ).toEqual(["partnerWantsKids"]);
  });

  test("block someone's children where the other has ruled them out", () => {
    const parent = { ...JORDAN, hasKids: "yes" };
    expect(
      hardBlockers({ ...SAM, partnerHasKidsOk: "no" }, parent, NOW).map(
        (b) => b.key,
      ),
    ).toEqual(["partnerHasKidsOk"]);
    expect(
      hardBlockers({ ...SAM, partnerHasKidsOk: "maybe" }, parent, NOW),
    ).toEqual([]);
  });

  test("block a required shared religion that isn't shared", () => {
    const devout = {
      ...SAM,
      religion: "Muslim",
      partnerReligionRequired: "yes",
    };
    const other = { ...JORDAN, religion: "Catholic" };
    expect(hardBlockers(devout, other, NOW).map((b) => b.key)).toEqual([
      "partnerReligionRequired",
    ]);
    expect(
      hardBlockers(devout, { ...JORDAN, religion: "muslim" }, NOW),
    ).toEqual([]);
    // Unrecorded, so unknown — and unknown never disqualifies.
    expect(hardBlockers(devout, without(JORDAN, "religion"), NOW)).toEqual([]);
  });
});

describe("the score", () => {
  test("is symmetric", () => {
    const forward = scored(SAM, JORDAN);
    const back = scored(JORDAN, SAM);
    expect(back.score).toBe(forward.score);
    expect(back.coverage).toBe(forward.coverage);
  });

  test("rates a good pair highly and a poor one low", () => {
    const good = scored(SAM, JORDAN);
    const poor = scored(SAM, {
      ...JORDAN,
      lookingFor: "companionship",
      wantsKids: "no",
      locationCity: "Lisbon",
      locationCountry: "Portugal",
      smoking: "regularly",
      drinking: "regularly",
      languages: "Portuguese",
      familyImportance: "low",
    });
    expect(good.score).toBeGreaterThan(80);
    expect(poor.score).toBeLessThan(MATCH_LIMITS.minScore);
    expect(isSuggestable(good)).toBe(true);
    expect(isSuggestable(poor)).toBe(false);
  });

  test("a blocked pair has no score at all", () => {
    const verdict = evaluatePair(SAM, { ...JORDAN, gender: "man" }, NOW);
    expect(verdict.ok).toBe(false);
    expect(isSuggestable(verdict)).toBe(false);
  });

  test("two near-empty profiles agree about everything and are still refused", () => {
    const thin = { lookingFor: "marriage" };
    const verdict = scored(thin, { lookingFor: "marriage" });
    expect(verdict.score).toBe(100);
    // …on almost no coverage, which is what stops it reaching the board.
    expect(verdict.coverage).toBeLessThan(MATCH_LIMITS.minCoverage);
    expect(isSuggestable(verdict)).toBe(false);
  });

  test("coverage grows with the profile", () => {
    const thin = scored({ lookingFor: "marriage" }, { lookingFor: "marriage" });
    const full = scored(SAM, JORDAN);
    expect(full.coverage).toBeGreaterThan(thin.coverage);
    expect(full.coverage).toBeLessThanOrEqual(1);
    expect(coverageLabel(full.coverage)).toContain("profile");
  });

  test("only reads a signal both sides have recorded", () => {
    const verdict = scored(SAM, without(JORDAN, "smoking"));
    expect(verdict.signals.map((s) => s.key)).not.toContain("smoking");
    expect(verdict.signals.map((s) => s.key)).toContain("lookingFor");
  });

  test("scores a one-sided preference the same whichever way round the pair is", () => {
    const parent = { ...JORDAN, hasKids: "yes" };
    const fine = { ...SAM, partnerHasKidsOk: "yes" };
    expect(scored(fine, parent).score).toBe(scored(parent, fine).score);
  });

  test("a different religion matters as much as they say it does", () => {
    const base = { ...SAM, religion: "Jewish" };
    const relaxed = scored(base, {
      ...JORDAN,
      religion: "Hindu",
      religionImportance: "low",
    });
    const strict = scored(
      { ...base, religionImportance: "high" },
      { ...JORDAN, religion: "Hindu", religionImportance: "high" },
    );
    expect(relaxed.score).toBeGreaterThan(strict.score);
  });

  test("says when there's a dealbreaker no algorithm can read", () => {
    expect(scored(SAM, JORDAN).checkDealbreakers).toBe(false);
    expect(
      scored(SAM, { ...JORDAN, dealbreakers: "Nobody who rides a motorbike." })
        .checkDealbreakers,
    ).toBe(true);
  });

  test("is stable: the same facts give the same number", () => {
    expect(scored(SAM, JORDAN).score).toBe(scored(SAM, JORDAN).score);
  });
});

describe("topSignals", () => {
  test("leads with the strongest, and keeps the weakest when it's weak", () => {
    const signals = [
      { key: "lookingFor", weight: 6, earned: 1, detail: "" },
      { key: "wantsKids", weight: 6, earned: 0.9, detail: "" },
      { key: "location", weight: 6, earned: 0.8, detail: "" },
      { key: "age", weight: 3, earned: 0.7, detail: "" },
      { key: "smoking", weight: 4, earned: 0, detail: "" },
    ];
    const top = topSignals(signals);
    expect(top).toHaveLength(3);
    expect(top[0].key).toBe("lookingFor");
    // The one thing that doesn't work is the one thing worth showing.
    expect(top.map((s) => s.key)).toContain("smoking");
  });

  test("shows only strengths when nothing is weak", () => {
    const signals = [
      { key: "lookingFor", weight: 6, earned: 1, detail: "" },
      { key: "wantsKids", weight: 6, earned: 0.9, detail: "" },
      { key: "location", weight: 6, earned: 0.8, detail: "" },
      { key: "age", weight: 3, earned: 0.7, detail: "" },
    ];
    expect(topSignals(signals).map((s) => s.key)).toEqual([
      "lookingFor",
      "wantsKids",
      "location",
    ]);
  });
});
