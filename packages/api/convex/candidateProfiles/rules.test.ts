import { describe, expect, test } from "vitest";
import { valueError } from "../profiles/rules";
import {
  CANDIDATE_GROUP_LABELS,
  CANDIDATE_GROUP_ORDER,
  CANDIDATE_PROFILE_FIELDS,
  CANDIDATE_PROFILE_NOTES,
  candidateEntryHoldsPersonalData,
  candidateField,
  candidateNoteLabel,
  candidateNotePolicy,
  candidateProfileFieldLabel,
  MATCH_CRITICAL_KEYS,
  MAX_RECONCILED,
  parseReconciled,
  profileOpeningBrief,
  profileUpdateBrief,
  reconcileInstruction,
  registryCatalogue,
} from "./rules";

describe("the registry", () => {
  test("every key is unique — a duplicate would silently shadow a field", () => {
    const keys = CANDIDATE_PROFILE_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    const noteKeys = CANDIDATE_PROFILE_NOTES.map((note) => note.key);
    expect(new Set(noteKeys).size).toBe(noteKeys.length);
  });

  test("every group renders, and nothing renders twice", () => {
    expect(new Set(CANDIDATE_GROUP_ORDER).size).toBe(
      CANDIDATE_GROUP_ORDER.length,
    );
    expect([...CANDIDATE_GROUP_ORDER].sort()).toEqual(
      Object.keys(CANDIDATE_GROUP_LABELS).sort(),
    );
    for (const field of CANDIDATE_PROFILE_FIELDS) {
      expect(CANDIDATE_GROUP_ORDER).toContain(field.group);
    }
  });

  test("every option is a value the field would accept back", () => {
    for (const field of CANDIDATE_PROFILE_FIELDS) {
      if (field.value.kind !== "choice" && field.value.kind !== "choices") {
        continue;
      }
      for (const option of field.value.options) {
        expect([field.key, valueError(field, option)]).toEqual([
          field.key,
          null,
        ]);
      }
    }
  });

  test("the special categories are never written without asking", () => {
    // Orientation, religion, politics, ethnicity and drug use are the places
    // where a model guessing wrong costs a real person something.
    for (const key of [
      "orientation",
      "religion",
      "politics",
      "ethnicity",
      "drugs",
      "dateOfBirth",
    ]) {
      expect([key, candidateField(key)?.policy]).toEqual([key, "suggest"]);
    }
    expect(candidateField("incomeBand")?.policy).toBe("matchmaker");
  });
});

describe("labels", () => {
  test("a fact and a known note read as themselves", () => {
    expect(candidateProfileFieldLabel("facts.wantsKids")).toBe(
      "Wants children",
    );
    expect(candidateProfileFieldLabel("notes.idealWeekend")).toBe(
      "Ideal weekend",
    );
  });

  test("a key nobody named is made readable rather than dropped", () => {
    expect(candidateNoteLabel("favouriteBooks")).toBe("Favourite books");
    expect(candidateProfileFieldLabel("notes.favouriteBooks")).toBe(
      "Favourite books",
    );
  });

  test("anything that isn't a profile entry is left alone", () => {
    expect(candidateProfileFieldLabel("email")).toBeNull();
    expect(candidateProfileFieldLabel("voice")).toBeNull();
  });
});

describe("note policy", () => {
  test("a key nobody has thought about is one an agent has to ask about", () => {
    expect(candidateNotePolicy("favouriteBooks")).toBe("suggest");
    expect(candidateNotePolicy("idealWeekend")).toBe("agent");
    expect(candidateNotePolicy("matchmakerNotes")).toBe("matchmaker");
  });
});

describe("erasure", () => {
  test("reaches the identifying facts and leaves the workflow ones", () => {
    expect(candidateEntryHoldsPersonalData("facts.dateOfBirth")).toBe(true);
    expect(candidateEntryHoldsPersonalData("facts.locationCity")).toBe(true);
    expect(candidateEntryHoldsPersonalData("facts.orientation")).toBe(true);
    expect(candidateEntryHoldsPersonalData("facts.wantsKids")).toBe(false);
    expect(candidateEntryHoldsPersonalData("facts.heightCm")).toBe(false);
  });

  test("never reaches a free-text note — those are the matchmaker's words", () => {
    expect(candidateEntryHoldsPersonalData("notes.matchmakerNotes")).toBe(
      false,
    );
    expect(candidateEntryHoldsPersonalData("notes.familyBackground")).toBe(
      false,
    );
  });
});

describe("registryCatalogue", () => {
  test("offers every field an agent may actually write", () => {
    const catalogue = registryCatalogue();
    for (const field of CANDIDATE_PROFILE_FIELDS) {
      if (field.policy === "matchmaker") continue;
      expect(catalogue).toContain(field.key);
    }
  });

  test("leaves out what the registry reserves for the matchmaker", () => {
    // Listing a field only to forbid it invites the model to reach for it,
    // and the value would be refused downstream anyway.
    const catalogue = registryCatalogue();
    for (const note of CANDIDATE_PROFILE_NOTES) {
      if (note.policy !== "matchmaker") continue;
      expect(catalogue).not.toContain(note.key);
    }
    expect(catalogue).not.toContain("matchmakerNotes");
    expect(catalogue).not.toContain("matchmakerTake");
  });

  test("spells out the shape of a value, so the model can hit it", () => {
    const catalogue = registryCatalogue();
    // A choice lists its options; a number gives its bounds.
    expect(catalogue).toContain("exactly one of:");
    expect(catalogue).toContain("a whole number between");
    expect(catalogue).toContain("YYYY-MM-DD");
  });
});

describe("profileOpeningBrief", () => {
  const entry = {
    kind: "facts" as const,
    key: "wantsKids",
    label: "Wants children",
    value: "yes",
    byHand: false,
    pending: false,
  };

  test("says what is already known, so it is not asked again", () => {
    const brief = profileOpeningBrief("Sam", [entry]);
    expect(brief).toContain("Wants children: yes");
  });

  test("marks what a person typed as untouchable", () => {
    const brief = profileOpeningBrief("Sam", [{ ...entry, byHand: true }]);
    expect(brief).toContain("never overwrite");
  });

  test("marks a field that already has a proposal waiting", () => {
    const brief = profileOpeningBrief("Sam", [{ ...entry, pending: true }]);
    expect(brief).toContain("already waiting");
  });

  test("says so plainly when there is nothing yet", () => {
    expect(profileOpeningBrief("Sam", [])).toContain("Nothing yet.");
  });
});

describe("profileUpdateBrief", () => {
  test("is null when nothing has changed, so no section is added", () => {
    expect(profileUpdateBrief([])).toBeNull();
  });
});

describe("reconcileInstruction", () => {
  const noticed = [{ observation: "Wants kids", quote: "I'd love kids" }];
  /** 2026-09-21, so the date the instruction states is a fixed one. */
  const NOW = Date.parse("2026-09-21T12:00:00Z");

  test("tells the model what day it is, so a relative date resolves", () => {
    // "My birthday's tomorrow" is a birth date only if the model knows when
    // today is. It goes in the per-turn instruction rather than the opening
    // brief, because a profile thread is briefed once and then talked to for
    // months.
    expect(reconcileInstruction("Sam", noticed, NOW)).toContain(
      "Monday, 2026-09-21",
    );
  });

  test("sends a stated age to the notes, never back out as a birth date", () => {
    const instruction = reconcileInstruction("Sam", noticed, NOW);
    expect(instruction).toContain("notes.age");
    expect(instruction).toContain("never work one back from an age");
  });

  test("carries the candidate's own words through to the second agent", () => {
    expect(reconcileInstruction("Sam", noticed, NOW)).toContain(
      "I'd love kids",
    );
  });

  test("never asks the model whether to write or to propose", () => {
    // That is the field's policy, applied by applyAgentEntries. An agent that
    // could choose would make the policy advisory (prd/phase-2.md §4.1B).
    const instruction = reconcileInstruction("Sam", noticed, NOW).toLowerCase();
    expect(instruction).not.toContain("suggest");
    expect(instruction).not.toContain("propose");
  });

  test("gives it a way to say nothing belongs here", () => {
    expect(reconcileInstruction("Sam", noticed, NOW)).toContain("NOTHING");
  });
});

describe("parseReconciled", () => {
  test("reads the five delimited fields", () => {
    expect(
      parseReconciled("facts | wantsKids | yes | 0.9 | I'd love kids one day"),
    ).toEqual([
      {
        kind: "facts",
        key: "wantsKids",
        value: "yes",
        confidence: 0.9,
        quote: "I'd love kids one day",
      },
    ]);
  });

  test("turns CLEAR into a clear rather than into a value", () => {
    const [entry] = parseReconciled(
      "facts | city | CLEAR | 0.8 | I've left London",
    );
    expect(entry?.value).toBeUndefined();
  });

  test("drops a line with no quote, because the quote is the point", () => {
    expect(parseReconciled("facts | wantsKids | yes | 0.9 |")).toEqual([]);
    expect(parseReconciled("facts | wantsKids | yes | 0.9")).toEqual([]);
  });

  test("refuses a kind that is not one of the two", () => {
    expect(
      parseReconciled("beliefs | wantsKids | yes | 0.9 | said so"),
    ).toEqual([]);
  });

  test("keeps a pipe inside the quote", () => {
    const [entry] = parseReconciled("notes | hobbies | Cooks | 0.7 | a | b");
    expect(entry?.quote).toBe("a | b");
  });

  test("drops a confidence that is not a number in range", () => {
    // Stored as absent rather than as a lie: a 0..1 field is read, and 5 would
    // be read as certainty.
    expect(
      parseReconciled("facts | age | 34 | high | I'm 34")[0]?.confidence,
    ).toBeUndefined();
    expect(
      parseReconciled("facts | age | 34 | 5 | I'm 34")[0]?.confidence,
    ).toBeUndefined();
  });

  test("skips one bad line without losing the good ones", () => {
    const entries = parseReconciled(
      [
        "facts | age | 34 | 0.9 | I'm 34",
        "nonsense",
        "notes | hobbies | Runs | 0.7 | I run",
      ].join("\n"),
    );
    expect(entries).toHaveLength(2);
  });

  test("takes NOTHING for an answer", () => {
    expect(parseReconciled("NOTHING")).toEqual([]);
    expect(parseReconciled("   ")).toEqual([]);
  });

  test("caps what one run can apply", () => {
    const lines = Array.from(
      { length: MAX_RECONCILED + 4 },
      (_, i) => `notes | k${i} | v${i} | 0.5 | said ${i}`,
    ).join("\n");
    expect(parseReconciled(lines)).toHaveLength(MAX_RECONCILED);
  });

  test("unwraps a value or a quote the model put in quotation marks", () => {
    const [entry] = parseReconciled('facts | age | 34 | 0.9 | "I\'m 34"');
    expect(entry?.quote).toBe("I'm 34");
  });
});

describe("MATCH_CRITICAL_KEYS", () => {
  test("every key is a field that actually exists", () => {
    // The list is hand-kept and feeds the drafting agent's gap list. A typo
    // here is silent: the key never matches, the label never renders, and the
    // agent simply never learns to ask about that field.
    const missing = MATCH_CRITICAL_KEYS.filter(
      (key) => candidateField(key) === null,
    );
    expect(missing).toEqual([]);
  });

  test("names no key twice", () => {
    expect(new Set(MATCH_CRITICAL_KEYS).size).toBe(MATCH_CRITICAL_KEYS.length);
  });

  test("asks for nothing only the matchmaker may fill in", () => {
    // Income band is theirs. Sending an agent to fish for it is both a bad
    // question and one whose answer it could not write down.
    const theirs = MATCH_CRITICAL_KEYS.filter(
      (key) => candidateField(key)?.policy === "matchmaker",
    );
    expect(theirs).toEqual([]);
  });
});
