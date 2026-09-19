import { describe, expect, test } from "vitest";
import {
  businessNameError,
  displayNameError,
  normaliseBusinessName,
  normaliseUsername,
  usernameError,
  usernameKey,
} from "./rules";

describe("usernames", () => {
  test("normaliseUsername trims and lowercases; usernameKey also drops dots", () => {
    expect(normaliseUsername("  Jane.Smith ")).toBe("jane.smith");
    expect(usernameKey("  Jane.Smith ")).toBe("janesmith");
    expect(usernameKey("j.a.n.e.smith")).toBe("janesmith");
  });

  test.each([
    "jane.smith",
    "JaneSmith",
    "  jane.smith  ",
    "matchmaker2025",
    "a12345",
    "a".repeat(30),
    // Substrings of reserved names are fine; only the whole key is reserved.
    "janethematchmaker",
  ])("accepts %j", (username) => {
    expect(usernameError(username)).toBeNull();
  });

  test.each([
    ["", "Choose a username."],
    ["   ", "Choose a username."],
    ["jane_smith", "Use only letters, numbers and periods."],
    ["jane smith", "Use only letters, numbers and periods."],
    ["jané.smith", "Use only letters, numbers and periods."],
    ["jane", "Use at least 6 characters."],
    ["a".repeat(31), "Use at most 30 characters."],
    [".janesmith", "A username can't start or end with a period."],
    ["janesmith.", "A username can't start or end with a period."],
    ["jane..smith", "A username can't have two periods in a row."],
    ["123456", "Include at least one letter."],
    ["12.34.56", "Include at least one letter."],
  ])("rejects %j", (username, message) => {
    expect(usernameError(username)).toBe(message);
  });

  test("reserved names are refused on the canonical key, whatever the dots or case", () => {
    for (const username of [
      "support",
      "no.reply",
      "Trust.And.Safety",
      "s.e.t.t.i.n.g.s",
    ]) {
      expect(usernameError(username)).toBe("That username isn't available.");
    }
  });
});

describe("profile fields", () => {
  test("displayNameError requires 1–60 characters after normalising", () => {
    expect(displayNameError("  ")).toBe("Enter a display name.");
    expect(displayNameError(" Jane   Smith ")).toBeNull();
    expect(displayNameError("a".repeat(60))).toBeNull();
    expect(displayNameError("a".repeat(61))).toBe(
      "That display name is too long.",
    );
  });

  test("the business name is optional and bounded", () => {
    expect(businessNameError("")).toBeNull();
    expect(normaliseBusinessName("   ")).toBeUndefined();
    expect(normaliseBusinessName(" Smith   & Co ")).toBe("Smith & Co");
    expect(businessNameError("a".repeat(81))).toBe(
      "That business name is too long.",
    );
  });
});
