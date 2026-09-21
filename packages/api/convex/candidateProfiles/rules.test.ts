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
