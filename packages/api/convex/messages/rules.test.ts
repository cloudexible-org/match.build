import { describe, expect, test } from "vitest";
import { messageBodyError, normaliseMessageBody } from "./rules";

describe("message bodies", () => {
  test("keep their line breaks and lose their edges", () => {
    expect(normaliseMessageBody("  Hi there\r\n\r\nSecond line  ")).toBe(
      "Hi there\n\nSecond line",
    );
    expect(normaliseMessageBody("   ")).toBe("");
  });

  test("must be non-empty and within the limit", () => {
    expect(messageBodyError(" \n ")).toBe("Write a message first.");
    expect(messageBodyError("a".repeat(5000))).toBeNull();
    expect(messageBodyError("a".repeat(5001))).toBe(
      "That message is too long to send in one go.",
    );
  });
});
