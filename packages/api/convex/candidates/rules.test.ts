import type { Infer } from "convex/values";
import { describe, expect, test } from "vitest";
import type { socialPlatform } from "../schema";
import {
  candidateNameError,
  handleError,
  importedHistoryError,
  normaliseCandidateName,
  normaliseHandle,
  normaliseHandles,
  normaliseImportedHistory,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "./rules";

// The schema's validator and the rules' list must name the same platforms.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const platformsMatch: Same<Infer<typeof socialPlatform>, SocialPlatform> = true;

describe("social handles", () => {
  test("the schema and the rules agree on platforms", () => {
    expect(platformsMatch).toBe(true);
    expect(SOCIAL_PLATFORMS).toHaveLength(7);
  });

  test.each([
    ["instagram", " @jane.smith ", "jane.smith"],
    ["instagram", "https://www.instagram.com/jane.smith/", "jane.smith"],
    ["tiktok", "https://www.tiktok.com/@jane.smith?lang=en", "jane.smith"],
    ["x", "https://twitter.com/janesmith", "janesmith"],
    ["x", "@janesmith", "janesmith"],
    ["whatsapp", "+44 (0) 7700-900.123", "+447700900123"],
    ["whatsapp", "0044 7700 900123", "+447700900123"],
    [
      "linkedin",
      " https://linkedin.com/in/jane ",
      "https://linkedin.com/in/jane",
    ],
    ["other", " jane#1234 ", "jane#1234"],
  ] as const)("normaliseHandle(%s, %j) → %j", (platform, raw, expected) => {
    expect(normaliseHandle(platform, raw)).toBe(expected);
  });

  test("WhatsApp needs a country code; nothing is guessed", () => {
    expect(handleError("whatsapp", "+44 7700 900123")).toBeNull();
    expect(handleError("whatsapp", "0044 7700 900123")).toBeNull();
    for (const raw of [
      "07700 900123",
      "7700900123",
      "+0 7700 900123",
      "+44 abc",
    ]) {
      expect(handleError("whatsapp", raw)).toBe(
        "Enter the number with its country code, like +44 7700 900123.",
      );
    }
  });

  test("a handle must be non-empty, bounded and have no spaces", () => {
    expect(handleError("instagram", " @ ")).toBe(
      "Enter a handle, or remove this row.",
    );
    expect(handleError("facebook", "jane smith")).toBe(
      "That doesn't look like a handle.",
    );
    expect(handleError("other", "a".repeat(101))).toBe(
      "That doesn't look like a handle.",
    );
    expect(handleError("facebook", "jane.smith.9")).toBeNull();
  });

  test("normaliseHandles drops duplicates after normalising, keeping order", () => {
    expect(
      normaliseHandles([
        { platform: "instagram", handle: "@Jane" },
        { platform: "whatsapp", handle: "+44 7700 900123" },
        { platform: "instagram", handle: "jane" },
        { platform: "tiktok", handle: "jane" },
      ]),
    ).toEqual([
      { platform: "instagram", handle: "Jane" },
      { platform: "whatsapp", handle: "+447700900123" },
      { platform: "tiktok", handle: "jane" },
    ]);
  });
});

describe("name and history", () => {
  test("the name is optional and bounded", () => {
    expect(normaliseCandidateName("   ")).toBeUndefined();
    expect(normaliseCandidateName(" Jane   Doe ")).toBe("Jane Doe");
    expect(candidateNameError("a".repeat(60))).toBeNull();
    expect(candidateNameError("a".repeat(61))).toBe("That name is too long.");
  });

  test("the history keeps its line breaks and is bounded", () => {
    expect(normaliseImportedHistory("  \n ")).toBeUndefined();
    expect(normaliseImportedHistory("\n Hi!\n\nHello \n")).toBe("Hi!\n\nHello");
    expect(importedHistoryError("a".repeat(100_000))).toBeNull();
    expect(importedHistoryError("a".repeat(100_001))).not.toBeNull();
  });
});
