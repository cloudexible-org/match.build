import { describe, expect, test } from "vitest";
import {
  emailError,
  instagramError,
  nameError,
  normaliseEmail,
  normaliseInstagram,
} from "./rules";

describe("normalisers", () => {
  test("normaliseEmail trims and lowercases", () => {
    expect(normaliseEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  test.each([
    ["@ada.matches", "ada.matches"],
    ["ada.matches", "ada.matches"],
    ["https://www.instagram.com/ada.matches/", "ada.matches"],
    ["instagram.com/ada", "ada"],
  ])("normaliseInstagram(%s) → %s", (input, expected) => {
    expect(normaliseInstagram(input)).toBe(expected);
  });
});

describe("field rules", () => {
  test("emailError distinguishes missing from malformed", () => {
    expect(emailError("   ")).toBe("Enter your email address.");
    expect(emailError("ada@example")).toBe("Enter a valid email address.");
    expect(emailError(" Ada@Example.com ")).toBeNull();
  });

  test("nameError bounds length only", () => {
    expect(nameError("")).toBeNull();
    expect(nameError("a".repeat(100))).toBeNull();
    expect(nameError("a".repeat(101))).not.toBeNull();
  });

  test("instagramError allows blank and URLs, rejects junk", () => {
    expect(instagramError("")).toBeNull();
    expect(instagramError("instagram.com/ada.matches")).toBeNull();
    expect(instagramError("ada matches!")).not.toBeNull();
    expect(instagramError("a".repeat(31))).not.toBeNull();
  });
});
