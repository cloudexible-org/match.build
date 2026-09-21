import { describe, expect, test } from "vitest";
import {
  ageFromDateOfBirth,
  agentWriteMode,
  displayValue,
  normaliseNoteKey,
  normaliseValue,
  noteBodyError,
  noteKeyError,
  PROFILE_LIMITS,
  type ProfileFieldDef,
  slugifyNoteKey,
  valueError,
} from "./rules";

const field = (over: Partial<ProfileFieldDef>): ProfileFieldDef => ({
  key: "x",
  label: "X",
  value: { kind: "text", maxLength: 10 },
  policy: "agent",
  personal: false,
  ...over,
});

describe("agentWriteMode", () => {
  test("a matchmaker-only field refuses an agent outright", () => {
    expect(agentWriteMode("matchmaker", null)).toBe("refuse");
    expect(agentWriteMode("matchmaker", "agent")).toBe("refuse");
  });

  test("a suggest field is always a proposal", () => {
    expect(agentWriteMode("suggest", null)).toBe("suggest");
    expect(agentWriteMode("suggest", "agent")).toBe("suggest");
  });

  test("an agent field is written, unless a person typed what's there", () => {
    expect(agentWriteMode("agent", null)).toBe("write");
    expect(agentWriteMode("agent", "agent")).toBe("write");
    // It revises its own work and what it talked someone into, never theirs.
    expect(agentWriteMode("agent", "agent_approved")).toBe("write");
    expect(agentWriteMode("agent", "matchmaker")).toBe("suggest");
  });
});

describe("valueError", () => {
  test("empty is never a value", () => {
    expect(valueError(field({}), "   ")).toBe("X needs a value.");
  });

  test("a date has to be a real day, in the past", () => {
    const dob = field({ label: "Date of birth", value: { kind: "date" } });
    expect(valueError(dob, "1990-02-30")).toContain("YYYY-MM-DD");
    expect(valueError(dob, "14/03/1987")).toContain("YYYY-MM-DD");
    expect(valueError(dob, "2999-01-01")).toContain("future");
    expect(valueError(dob, " 1987-03-14 ")).toBeNull();
  });

  test("a range is two numbers, lower first, both in bounds", () => {
    const range = field({
      label: "Partner age range",
      value: { kind: "range", min: 18, max: 110 },
    });
    expect(valueError(range, "36-28")).toContain("lower number");
    expect(valueError(range, "12-40")).toContain("between 18 and 110");
    expect(valueError(range, "28")).toContain("two numbers");
    expect(valueError(range, " 28 - 36 ")).toBeNull();
  });

  test("a choice is one of the options, however it was capitalised", () => {
    const choice = field({
      label: "Wants children",
      value: { kind: "choice", options: ["yes", "no", "maybe"] },
    });
    expect(valueError(choice, "Yes")).toBeNull();
    expect(valueError(choice, "yes please")).toContain(
      "one of: yes, no, maybe",
    );
  });

  test("a list is capped by count and by the length of each entry", () => {
    const list = field({
      label: "Languages",
      value: { kind: "list", maxItems: 2, maxLength: 6 },
    });
    expect(valueError(list, "Dutch, Greek, Welsh")).toContain("at most 2");
    expect(valueError(list, "Portuguese")).toContain("at most 6 characters");
    expect(valueError(list, "Dutch, Greek")).toBeNull();
  });
});

describe("normaliseValue", () => {
  test("a value means one thing however it was typed", () => {
    expect(
      normaliseValue(
        field({ value: { kind: "choice", options: ["yes"] } }),
        "  YES  ",
      ),
    ).toBe("yes");
    expect(
      normaliseValue(
        field({ value: { kind: "integer", min: 0, max: 9 } }),
        "07",
      ),
    ).toBe("7");
    expect(
      normaliseValue(
        field({ value: { kind: "range", min: 18, max: 99 } }),
        " 28 - 36 ",
      ),
    ).toBe("28-36");
  });

  test("a list keeps its order and drops the repeats", () => {
    const list = field({ value: { kind: "list", maxItems: 9, maxLength: 20 } });
    expect(normaliseValue(list, "English,  Dutch , English")).toBe(
      "English, Dutch",
    );
  });
});

describe("displayValue", () => {
  test("a range reads with an en dash rather than a hyphen", () => {
    expect(
      displayValue(
        field({ value: { kind: "range", min: 0, max: 99 } }),
        "28-36",
      ),
    ).toBe("28–36");
  });
});

describe("ageFromDateOfBirth", () => {
  test("counts the birthday, not the year", () => {
    const march = Date.parse("2026-03-13T00:00:00Z");
    expect(ageFromDateOfBirth("1987-03-14", march)).toBe(38);
    expect(ageFromDateOfBirth("1987-03-14", march + 86_400_000)).toBe(39);
    expect(ageFromDateOfBirth("not a date", march)).toBeNull();
  });
});

describe("note keys and bodies", () => {
  test("a key is letters, digits and underscores", () => {
    expect(noteKeyError("")).toBe("A note needs a name.");
    expect(noteKeyError("ideal_weekend")).toBeNull();
    // The camelCase keys the suggested list uses, and every key already
    // stored, stay valid.
    expect(noteKeyError("idealWeekend")).toBeNull();
    expect(noteKeyError("ideal weekend")).toContain("letters and digits");
    expect(normaliseNoteKey(" IdealWeekend ")).toBe("idealWeekend");
  });

  test("a name a person typed becomes a key", () => {
    expect(slugifyNoteKey("Ideal Weekend")).toBe("ideal_weekend");
    expect(slugifyNoteKey("  What went wrong?  ")).toBe("what_went_wrong");
    expect(slugifyNoteKey("Books / films")).toBe("books_films");
  });

  test("the key it makes is one noteKeyError accepts", () => {
    for (const typed of [
      "Ideal Weekend",
      "5-a-side football",
      "___odd___",
      "café & bar",
      "x".repeat(PROFILE_LIMITS.noteKey + 20),
    ]) {
      const key = slugifyNoteKey(typed);
      expect([typed, noteKeyError(key)]).toEqual([typed, null]);
    }
  });

  test("a name with nothing usable in it is left for noteKeyError to refuse", () => {
    expect(slugifyNoteKey("   ")).toBe("");
    expect(slugifyNoteKey("!!!")).toBe("");
    expect(noteKeyError(slugifyNoteKey("!!!"))).toBe("A note needs a name.");
  });

  test("a body is trimmed and non-empty", () => {
    expect(noteBodyError("  \n ")).toBe("Write something first.");
    expect(noteBodyError("a".repeat(5_001))).toBe("That note is too long.");
    expect(noteBodyError(" Hiking. ")).toBeNull();
  });
});
